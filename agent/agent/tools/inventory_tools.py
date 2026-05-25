from __future__ import annotations

from typing import Optional

import httpx
import opik
from langchain_core.tools import tool, ToolException

from agent.config import BACKEND_URL


@tool
@opik.track(name="query_lots")
def query_lots(facility_id: Optional[str] = None) -> list[dict]:
    """Return ingredient lots with spoilage risk scores, optionally filtered by facility."""
    params = {}
    if facility_id:
        params["facility_id"] = facility_id

    resp = httpx.get(f"{BACKEND_URL}/api/lots", params=params, timeout=10)
    if resp.status_code != 200:
        raise ToolException(f"GET /api/lots returned {resp.status_code}: {resp.text}")
    return resp.json()


@tool
@opik.track(name="substitution_candidates")
def substitution_candidates(
    ingredient_id: str,
    facility_id: Optional[str] = None,
) -> list[dict]:
    """Return ranked substitution SKUs when an ingredient is short.

    Finds the highest-risk lot for the given ingredient (optionally within a facility)
    then returns what else can be produced with current stock.
    """
    params: dict = {"sort_by_risk": "true"}
    if facility_id:
        params["facility_id"] = facility_id

    lots_resp = httpx.get(f"{BACKEND_URL}/api/lots", params=params, timeout=10)
    if lots_resp.status_code != 200:
        raise ToolException(f"GET /api/lots returned {lots_resp.status_code}: {lots_resp.text}")

    lots = lots_resp.json()
    matching = [lot for lot in lots if lot.get("ingredient_id") == ingredient_id]
    if not matching:
        return []

    lot_id = matching[0]["lot_id"]

    subs_resp = httpx.get(f"{BACKEND_URL}/api/lots/{lot_id}/substitutions", timeout=10)
    if subs_resp.status_code != 200:
        raise ToolException(
            f"GET /api/lots/{lot_id}/substitutions returned {subs_resp.status_code}: {subs_resp.text}"
        )
    return subs_resp.json()
