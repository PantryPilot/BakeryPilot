from __future__ import annotations

import re
from typing import Annotated

import httpx
import opik
from langchain_core.tools import tool, ToolException

from agent.config import BACKEND_URL

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _tokens(text: str) -> set[str]:
    return {t for t in _TOKEN_RE.findall(text.lower()) if len(t) > 1}


def _score_product(query: str, product: dict) -> int:
    """Rank catalog rows against a free-text product name."""
    q = query.lower().strip()
    name = str(product.get("name", "")).lower()
    sku = str(product.get("sku_id", "")).lower().replace("sku-", "").replace("-", " ")

    if not q:
        return 0
    if q == name:
        return 10_000
    if q in name or name in q:
        return 5_000 + len(q)

    q_tokens = _tokens(q)
    if not q_tokens:
        return 0

    name_tokens = _tokens(name)
    sku_tokens = _tokens(sku)
    combined = name_tokens | sku_tokens
    overlap = len(q_tokens & combined)
    missing = len(q_tokens - combined)
    return overlap * 100 - missing * 25


def _fetch_products() -> list[dict]:
    resp = httpx.get(f"{BACKEND_URL}/api/production/products", timeout=15)
    if resp.status_code != 200:
        raise ToolException(
            f"GET /api/production/products returned {resp.status_code}: {resp.text}"
        )
    return resp.json()


@tool
@opik.track(name="list_products")
def list_products(
    category: Annotated[
        str | None,
        "Optional category filter, e.g. bread / naan / bun / flatbread",
    ] = None,
) -> list[dict]:
    """List the product catalog with exact sku_id values.

    ALWAYS call this (or resolve_product_sku) before draft_new_production_order,
    draft_schedule_change, draft_outbound_shipment, or get_product_recipe.
    Never invent sku_id strings — they must come from this list.
    """
    products = _fetch_products()
    rows = [
        {
            "sku_id": p["sku_id"],
            "name": p["name"],
            "category": p.get("category"),
        }
        for p in products
    ]
    if category:
        cat = category.lower().strip()
        rows = [r for r in rows if str(r.get("category", "")).lower() == cat]
    return rows


@tool
@opik.track(name="resolve_product_sku")
def resolve_product_sku(
    query: Annotated[
        str,
        "Product display name or partial name, e.g. 'Country Harvest Cinnamon Raisin Bread'",
    ],
    category: Annotated[
        str | None,
        "Optional category filter, e.g. bread",
    ] = None,
) -> dict:
    """Resolve a human product name to the exact sku_id in the catalog.

    Use when the operator mentions a product by name. Returns sku_id, name, and
    category. If several products match, returns candidates — pick one or ask
    the operator to clarify. Never pass a guessed sku_id to draft tools.
    """
    products = _fetch_products()
    if category:
        cat = category.lower().strip()
        products = [p for p in products if str(p.get("category", "")).lower() == cat]
    if not products:
        raise ToolException("No products in the catalog. Run make schema.seed first.")

    ranked = sorted(
        ((_score_product(query, p), p) for p in products),
        key=lambda item: item[0],
        reverse=True,
    )
    best_score, best = ranked[0]
    if best_score < 150:
        sample = ", ".join(f"{p['name']} ({p['sku_id']})" for _, p in ranked[:5])
        raise ToolException(
            f"No product matched '{query}'. Closest catalog entries: {sample}. "
            "Call list_products for the full catalog or ask the operator to clarify."
        )

    runner_up = [(score, prod) for score, prod in ranked[1:4] if score >= best_score * 0.85]
    if runner_up and best_score < 8_000:
        return {
            "status": "ambiguous",
            "message": f"Multiple products match '{query}'. Pick the exact sku_id below.",
            "candidates": [
                {
                    "sku_id": best["sku_id"],
                    "name": best["name"],
                    "category": best.get("category"),
                    "score": best_score,
                },
                *[
                    {
                        "sku_id": prod["sku_id"],
                        "name": prod["name"],
                        "category": prod.get("category"),
                        "score": score,
                    }
                    for score, prod in runner_up
                ],
            ],
        }

    return {
        "status": "resolved",
        "sku_id": best["sku_id"],
        "name": best["name"],
        "category": best.get("category"),
    }


@tool
@opik.track(name="list_production_lines")
def list_production_lines(
    facility_id: Annotated[
        str | None,
        "Optional facility id, e.g. plant-toronto",
    ] = None,
) -> list[dict]:
    """List production lines with exact line_id values and current status.

    Use before draft_new_production_order to pick an idle line. Never invent
    line_id strings — they must come from this list.
    """
    params: dict = {}
    if facility_id:
        params["facility_id"] = facility_id
    resp = httpx.get(f"{BACKEND_URL}/api/production/lines", params=params, timeout=15)
    if resp.status_code != 200:
        raise ToolException(
            f"GET /api/production/lines returned {resp.status_code}: {resp.text}"
        )
    return [
        {
            "line_id": row["line_id"],
            "facility_id": row["facility_id"],
            "name": row.get("name"),
            "status": row.get("status"),
            "current_sku_id": (row.get("current_order") or {}).get("sku_id"),
        }
        for row in resp.json()
    ]


@tool
@opik.track(name="list_facilities")
def list_facilities() -> list[dict]:
    """List plants with exact facility_id values (e.g. plant-toronto).

    Use when the operator mentions a plant by city or name — never guess ids.
    """
    resp = httpx.get(f"{BACKEND_URL}/api/facilities", timeout=10)
    if resp.status_code != 200:
        raise ToolException(f"GET /api/facilities returned {resp.status_code}: {resp.text}")
    return [
        {
            "facility_id": row["facility_id"],
            "short_code": row.get("short_code"),
            "name": row.get("name"),
            "city": row.get("city"),
        }
        for row in resp.json()
    ]
