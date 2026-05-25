from __future__ import annotations

from typing import Optional

import httpx
import opik
from langchain_core.tools import tool, ToolException

from agent.config import BACKEND_URL


@opik.track(name="query_lots")
@tool
def query_lots(facility_id: Optional[str] = None) -> list[dict]:
    """Return ingredient lots with spoilage risk scores, optionally filtered by facility."""
    params = {}
    if facility_id:
        params["facility_id"] = facility_id

    resp = httpx.get(f"{BACKEND_URL}/api/lots", params=params, timeout=10)
    if resp.status_code != 200:
        raise ToolException(f"GET /api/lots returned {resp.status_code}: {resp.text}")
    return resp.json()


@opik.track(name="substitution_candidates")
@tool
def substitution_candidates(blocked_sku: str) -> list[dict]:
    """Return ranked substitution candidates for a blocked SKU based on current stock and margin."""
    resp = httpx.get(
        f"{BACKEND_URL}/api/substitution_candidates",
        params={"sku": blocked_sku},
        timeout=10,
    )
    if resp.status_code != 200:
        raise ToolException(
            f"GET /api/substitution_candidates returned {resp.status_code}: {resp.text}"
        )
    return resp.json()
