from __future__ import annotations

from typing import Annotated

import httpx
import opik
from langchain_core.tools import tool, ToolException

from agent.config import BACKEND_URL


@tool
@opik.track(name="get_waste_counter")
def get_waste_counter() -> dict:
    """Return the running waste-avoided counter: kg avoided, dollars saved, and CO2e avoided."""
    resp = httpx.get(f"{BACKEND_URL}/api/esg/counter", timeout=10)
    if resp.status_code != 200:
        raise ToolException(f"GET /api/esg/counter returned {resp.status_code}: {resp.text}")
    return resp.json()


@tool
@opik.track(name="run_pattern_analysis")
def run_pattern_analysis() -> list[dict]:
    """Return top ESG waste patterns clustered by plant, ingredient, and waste kind."""
    resp = httpx.get(f"{BACKEND_URL}/api/esg/patterns", timeout=15)
    if resp.status_code != 200:
        raise ToolException(f"GET /api/esg/patterns returned {resp.status_code}: {resp.text}")
    return resp.json()


@tool
@opik.track(name="generate_esg_report")
def generate_esg_report(
    facility_id: Annotated[str | None, "Facility to scope the Scope 3 report (optional)"] = None,
    period: Annotated[str | None, "Report period e.g. '2024-Q1' (optional)"] = None,
) -> dict:
    """Generate a Scope 3 ESG PDF report for retailer disclosure. Returns the download URL."""
    params: dict = {}
    if facility_id:
        params["facility_id"] = facility_id
    if period:
        params["period"] = period
    resp = httpx.get(f"{BACKEND_URL}/api/esg/scope3.pdf", params=params, timeout=30)
    if resp.status_code not in (200, 307):
        raise ToolException(f"GET /api/esg/scope3.pdf returned {resp.status_code}: {resp.text}")
    return {
        "report_url": f"{BACKEND_URL}/api/esg/scope3.pdf",
        "status": "ready",
        "content_type": "application/pdf",
    }
