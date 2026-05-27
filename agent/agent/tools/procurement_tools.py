from __future__ import annotations

from typing import Annotated

import httpx
import opik
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool, ToolException

from agent.config import BACKEND_URL
from agent.llm import make_chat_llm
from agent.prompts.store import get_prompt_store


class _OrderItem:
    def __init__(self, ingredient_id: str, quantity_kg: float, unit_price: float):
        self.ingredient_id = ingredient_id
        self.quantity_kg = quantity_kg
        self.unit_price = unit_price


def _post_draft(supplier_id: str, items: list[dict], delivery_date: str) -> dict:
    for item in items:
        if "unit_price" not in item:
            item["unit_price"] = 1.0

    resp = httpx.post(
        f"{BACKEND_URL}/api/orders/draft",
        json={"supplier_id": supplier_id, "items": items, "delivery_date": delivery_date},
        timeout=10,
    )
    if resp.status_code != 200:
        raise ToolException(f"POST /api/orders/draft returned {resp.status_code}: {resp.text}")
    return resp.json()


@tool
@opik.track(name="get_supplier_risk")
def get_supplier_risk(
    supplier_id: Annotated[str, "Supplier ID (e.g. sup-coastalberry)"],
) -> dict:
    """Return risk profile for a supplier plus relevant regional context.

    Two layers of disruption signal:
      - `disruption_signals`: rows directly tagged to this supplier_id
        (historical ERP-side events, supplier-specific risk flags).
      - `regional_signals`: broad weather + macro-news signals from the
        last 7 days (severity >= 0.2). These have no supplier_id by
        design — they're per-facility weather forecasts (Open-Meteo) and
        commodity-domain news (GDELT). Use them to reason about indirect
        risk: a heavy_rain signal near a supplier's region or a negative
        wheat-shortage news cluster is worth citing in a negotiation
        even when the supplier itself hasn't missed deliveries.
    """
    sup_resp = httpx.get(f"{BACKEND_URL}/api/suppliers/{supplier_id}", timeout=10)
    if sup_resp.status_code == 404:
        raise ToolException(f"Supplier '{supplier_id}' not found.")
    if sup_resp.status_code != 200:
        raise ToolException(f"GET /api/suppliers/{supplier_id} returned {sup_resp.status_code}: {sup_resp.text}")
    supplier = sup_resp.json()

    # Supplier-specific events (historical, ERP-sourced).
    dis_resp = httpx.get(
        f"{BACKEND_URL}/api/disruptions",
        params={"supplier_id": supplier_id},
        timeout=10,
    )
    disruptions = dis_resp.json() if dis_resp.status_code == 200 else []

    # Broad regional context (Open-Meteo + GDELT — recent, unscoped).
    # No min_severity threshold here: weather signals in temperate regions
    # are typically severity < 0.15 even when worth citing in negotiation;
    # leave the LLM to weigh severity rather than filtering at the source.
    # Filter by `sources` (not `kinds`) — open_meteo writes one row per
    # condition kind (heavy_rain/wind/heat/frost) and a sources filter
    # picks them all up with one param.
    regional_resp = httpx.get(
        f"{BACKEND_URL}/api/disruptions",
        params={
            "include_unscoped": "true",
            "since_days": 7,
            "sources": "open_meteo,gdelt",
            "limit": 30,
        },
        timeout=10,
    )
    regional = regional_resp.json() if regional_resp.status_code == 200 else []

    return {
        "supplier_id": supplier_id,
        "name": supplier.get("name"),
        "on_time_rate": supplier.get("on_time_rate"),
        "lead_time_days": supplier.get("lead_time_days"),
        "moq_kg": supplier.get("moq_kg"),
        "moq_tax_usd_qtd": supplier.get("moq_tax_usd_qtd"),
        "disruption_signals": disruptions,
        "regional_signals": regional,
    }


@tool
@opik.track(name="get_commodity_benchmark")
def get_commodity_benchmark(
    commodity_id: Annotated[
        str,
        "Commodity series ID, e.g. 'wheat-cbot-zw', 'sugar-ice-sb', "
        "'crude-fred-wti', 'fx-cad-usd'. Use 'all' to list every available series.",
    ],
    days: Annotated[int, "Rolling-window size in days for avg/min/max stats. 7-365."] = 30,
) -> dict:
    """Fetch latest close + rolling-window stats for a commodity or FX series.

    Backed by the `commodity_prices` table (populated by Yahoo Finance, Bank
    of Canada, Frankfurter, FRED). Use this whenever you need to ground a
    negotiation argument in real market data — e.g. cite the 30-day average
    CBOT wheat close when arguing a supplier's contracted price is N% above
    benchmark.

    Returns a stats dict with: latest_close, latest_date, avg_close, min/max,
    pct_change_vs_window_avg, and sample_count. When `commodity_id='all'`
    returns the list of available series with their stats.
    """
    if commodity_id.strip().lower() == "all":
        resp = httpx.get(
            f"{BACKEND_URL}/api/commodity_prices",
            params={"days": days},
            timeout=10,
        )
        if resp.status_code != 200:
            raise ToolException(
                f"GET /api/commodity_prices returned {resp.status_code}: {resp.text}"
            )
        return {"series": resp.json(), "window_days": days}

    resp = httpx.get(
        f"{BACKEND_URL}/api/commodity_prices/{commodity_id}",
        params={"days": days},
        timeout=10,
    )
    if resp.status_code == 404:
        raise ToolException(
            f"No price data for commodity_id '{commodity_id}'. "
            f"Call with commodity_id='all' to see available series, or refresh "
            f"the matching data source in the admin panel."
        )
    if resp.status_code != 200:
        raise ToolException(
            f"GET /api/commodity_prices/{commodity_id} returned {resp.status_code}: {resp.text}"
        )
    return resp.json()


@tool
@opik.track(name="preview_landed_cost")
def preview_landed_cost(
    supplier_id: Annotated[str, "Supplier ID"],
    items: Annotated[list[dict], "List of {ingredient_id, quantity_kg, unit_price}"],
    delivery_date: Annotated[str, "ISO date YYYY-MM-DD for cost projection"],
) -> dict:
    """Preview the landed cost breakdown for a potential order without committing it.

    Creates a draft action card (stays pending, never auto-confirmed).
    Returns landed_cost_breakdown only — the action_card_id is intentionally discarded.
    """
    data = _post_draft(supplier_id, items, delivery_date)
    return data["landed_cost_breakdown"]


@tool
@opik.track(name="build_order_draft")
def build_order_draft(
    supplier_id: Annotated[str, "Supplier ID"],
    items: Annotated[list[dict], "List of {ingredient_id, quantity_kg, unit_price}"],
    delivery_date: Annotated[str, "ISO date YYYY-MM-DD"],
) -> dict:
    """Draft a supplier order for human review. Returns action_card_id and landed_cost_breakdown.

    The order is NOT placed until the user confirms the action card.
    """
    data = _post_draft(supplier_id, items, delivery_date)
    return {
        "action_card_id": data["action_card_id"],
        "landed_cost_breakdown": data["landed_cost_breakdown"],
    }


@tool
@opik.track(name="draft_negotiation")
def draft_negotiation(
    trigger_kind: Annotated[str, "One of: moq_tax | late_window | price_drift"],
    supplier_name: Annotated[str, "Supplier name for the email greeting"],
    supporting_data: Annotated[dict, "Key metrics to reference — e.g. {moq_tax_usd, on_time_rate, price_gap_pct}"],
) -> dict:
    """Draft a supplier negotiation email.

    Returns {subject, body_md} for human review — never sent automatically.
    Every number in the body is grounded in supporting_data.
    """
    valid = {"moq_tax", "late_window", "price_drift"}
    if trigger_kind not in valid:
        raise ToolException(f"trigger_kind must be one of {valid}, got '{trigger_kind}'")

    store = get_prompt_store()
    system_prompt = store.get("negotiation")
    llm = make_chat_llm(purpose="negotiation", temperature=0.3)

    user_msg = (
        f"Trigger: {trigger_kind}\n"
        f"Supplier: {supplier_name}\n"
        f"Data: {supporting_data}\n\n"
        "Draft the negotiation email now."
    )
    response = llm.invoke([SystemMessage(content=system_prompt), HumanMessage(content=user_msg)])
    body = response.content.strip()

    lines = body.splitlines()
    subject = next((l.replace("Subject:", "").strip() for l in lines if l.startswith("Subject:")), f"Re: {trigger_kind.replace('_', ' ').title()} — FGF Brands")
    body_without_subject = "\n".join(l for l in lines if not l.startswith("Subject:")).strip()

    return {"subject": subject, "body_md": body_without_subject, "trigger_kind": trigger_kind}
