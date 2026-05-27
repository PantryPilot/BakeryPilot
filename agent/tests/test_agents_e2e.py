"""
End-to-end agent tests.

Each test sends a realistic query, runs the full LangGraph pipeline against the
live backend (localhost:8000), and asserts:
  1. Correct intent was classified.
  2. At least one tool was actually called.
  3. The final AIMessage contains real data (not a no-data refusal).

Run with:
    cd agent && uv run pytest tests/test_agents_e2e.py -v
Requirements: backend running on :8000 with seeded DB.
"""
from __future__ import annotations

import uuid

import httpx
import pytest
from langchain_core.messages import AIMessage, ToolMessage

from agent.graph import _graph

BACKEND = "http://localhost:8000"


def _backend_up() -> bool:
    try:
        return httpx.get(f"{BACKEND}/healthz", timeout=3).status_code == 200
    except Exception:
        return False


def _has_data() -> bool:
    try:
        lots = httpx.get(f"{BACKEND}/api/lots", timeout=5).json()
        return isinstance(lots, list) and len(lots) > 0
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not _backend_up() or not _has_data(),
    reason="live backend with seeded DB required",
)


def _run(message: str) -> dict:
    config = {"configurable": {"thread_id": str(uuid.uuid4())}}
    final = {}
    for state in _graph.stream(
        {"messages": [__import__("langchain_core.messages", fromlist=["HumanMessage"]).HumanMessage(content=message)]},
        config=config,
        stream_mode="values",
    ):
        final = state
    return final


def _tool_names(state: dict) -> list[str]:
    return [
        m.name
        for m in state.get("messages", [])
        if isinstance(m, ToolMessage)
    ]


def _last_text(state: dict) -> str:
    msgs = state.get("messages", [])
    for m in reversed(msgs):
        if isinstance(m, AIMessage) and m.content:
            return str(m.content).lower()
    return ""


REFUSAL_PHRASES = [
    "no live tool",
    "no real-time data",
    "fabricating",
    "i don't have",
    "i cannot",
    "out of scope",
    "not in my domain",
    "not part of my domain",
]


def _is_refusal(text: str) -> bool:
    return any(phrase in text for phrase in REFUSAL_PHRASES)


# ---------------------------------------------------------------------------
# InventoryAgent
# ---------------------------------------------------------------------------

def test_inventory_intent_classified():
    state = _run("Which ingredient lots are expiring in the next 7 days?")
    assert state.get("intent") == "inventory", f"got intent={state.get('intent')}"


def test_inventory_tool_called():
    state = _run("Show me all ingredient lots with high spoilage risk at Plant Toronto.")
    tools = _tool_names(state)
    assert "query_lots" in tools, f"query_lots not called — tools used: {tools}"


def test_inventory_response_has_data():
    state = _run("List the top 5 lots most at risk of expiring this week.")
    text = _last_text(state)
    assert not _is_refusal(text), f"Agent refused instead of answering:\n{text[:400]}"
    assert any(kw in text for kw in ["lot", "expir", "ingredient", "kg", "facility"]), (
        f"Response looks empty of inventory data:\n{text[:400]}"
    )


# ---------------------------------------------------------------------------
# ProcurementAgent — supplier risk
# ---------------------------------------------------------------------------

def test_procurement_intent_classified():
    state = _run("What is the risk level for supplier sup-coastalberry?")
    assert state.get("intent") == "procurement", f"got intent={state.get('intent')}"


def test_procurement_supplier_risk_tool_called():
    state = _run("What is the risk level for supplier sup-coastalberry?")
    tools = _tool_names(state)
    assert "get_supplier_risk" in tools, (
        f"get_supplier_risk not called — tools used: {tools}"
    )


def test_procurement_supplier_risk_response_has_data():
    state = _run("What is the risk level for supplier sup-coastalberry?")
    text = _last_text(state)
    assert not _is_refusal(text), f"Agent refused instead of answering:\n{text[:400]}"
    assert any(kw in text for kw in ["on_time", "on-time", "lead", "risk", "disruption", "coastalberry", "supplier"]), (
        f"Response lacks supplier risk data:\n{text[:400]}"
    )


def test_procurement_landed_cost_tool_called():
    state = _run(
        "Preview the landed cost for ordering 1200 kg of ing-flour-ap from sup-northgrain "
        "at $0.80/kg, delivery 2026-06-10. Use ingredient ID ing-flour-ap."
    )
    tools = _tool_names(state)
    assert "preview_landed_cost" in tools or "build_order_draft" in tools, (
        f"No cost tool called — tools used: {tools}"
    )


# ---------------------------------------------------------------------------
# SchedulerAgent
# ---------------------------------------------------------------------------

def test_scheduler_intent_classified():
    state = _run("Show me the production schedule for Plant Toronto.")
    assert state.get("intent") == "scheduler", f"got intent={state.get('intent')}"


def test_scheduler_tool_called():
    state = _run("What is the current production schedule and are there any changeover conflicts?")
    tools = _tool_names(state)
    assert any(t in tools for t in ["suggest_production_schedule", "run_changeover_optimizer"]), (
        f"No scheduler tool called — tools used: {tools}"
    )


def test_scheduler_response_has_data():
    state = _run("What is the current production schedule for this week?")
    text = _last_text(state)
    assert not _is_refusal(text), f"Agent refused:\n{text[:400]}"
    assert any(kw in text for kw in ["schedule", "line", "sku", "shift", "production", "facility"]), (
        f"Response lacks schedule data:\n{text[:400]}"
    )


# ---------------------------------------------------------------------------
# YieldAgent
# ---------------------------------------------------------------------------

def test_yield_intent_classified():
    state = _run("What is the yield variance for the last production run?")
    assert state.get("intent") == "yield", f"got intent={state.get('intent')}"


def test_yield_tool_called():
    state = _run("Show me the yield variance for recent production runs.")
    tools = _tool_names(state)
    assert "get_yield_variance" in tools, (
        f"get_yield_variance not called — tools used: {tools}"
    )


def test_yield_response_has_data():
    state = _run("Which production runs had the worst yield variance this month?")
    text = _last_text(state)
    assert not _is_refusal(text), f"Agent refused:\n{text[:400]}"
    assert any(kw in text for kw in ["variance", "yield", "run", "ingredient", "actual", "theoretical", "%"]), (
        f"Response lacks yield data:\n{text[:400]}"
    )


# ---------------------------------------------------------------------------
# ESGAgent
# ---------------------------------------------------------------------------

def test_esg_intent_classified():
    state = _run("How much waste have we avoided this quarter?")
    assert state.get("intent") == "esg", f"got intent={state.get('intent')}"


def test_esg_tool_called():
    state = _run("What is our current ESG waste counter and CO2e avoided?")
    tools = _tool_names(state)
    assert "get_waste_counter" in tools, (
        f"get_waste_counter not called — tools used: {tools}"
    )


def test_esg_response_has_data():
    state = _run("Show me the waste avoidance totals and any recurring waste patterns.")
    text = _last_text(state)
    assert not _is_refusal(text), f"Agent refused:\n{text[:400]}"
    assert any(kw in text for kw in ["kg", "co2", "waste", "avoided", "dollar", "pattern"]), (
        f"Response lacks ESG data:\n{text[:400]}"
    )


# ---------------------------------------------------------------------------
# WeeklyPlanAgent
# ---------------------------------------------------------------------------

def test_weekly_plan_intent_classified():
    state = _run("Plan my week across all operations.")
    assert state.get("intent") == "weekly_plan", f"got intent={state.get('intent')}"


def test_weekly_plan_uses_multiple_tools():
    state = _run("Give me a full weekly operations plan.")
    tools = _tool_names(state)
    assert len(set(tools)) >= 2, (
        f"Weekly plan should call multiple tools, called: {tools}"
    )


def test_weekly_plan_response_structured():
    state = _run("Plan my week: inventory alerts, schedule, yield, ESG.")
    text = _last_text(state)
    assert not _is_refusal(text), f"Agent refused:\n{text[:400]}"
    assert any(kw in text for kw in ["inventory", "schedule", "yield", "esg", "action"]), (
        f"Weekly plan lacks expected sections:\n{text[:400]}"
    )
