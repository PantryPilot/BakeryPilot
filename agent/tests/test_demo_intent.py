"""Tests for rule-based demo intent routing (no LLM)."""

from langchain_core.messages import HumanMessage

from agent.agents.demo import DemoAgent, _format_summary, _parse_facility
from agent.agents.orchestrator import _match_demo_intent, classify_intent


def test_match_demo_intent_user_phrase():
    assert _match_demo_intent("Generate demo orders and schedules")


def test_match_demo_intent_mock_data():
    assert _match_demo_intent("Populate mock data for the schedule page")


def test_match_demo_intent_rejects_unrelated():
    assert not _match_demo_intent("What is the production schedule for plant 1?")


def test_classify_intent_demo_without_llm():
    state = classify_intent({"messages": [HumanMessage(content="Generate demo orders and schedules")]})
    assert state["intent"] == "demo"


def test_parse_facility_toronto():
    assert _parse_facility("Generate demo orders for Toronto") == "plant-toronto"


def test_format_summary():
    text = _format_summary(
        {
            "totals": {"retailer_orders": 5, "supplier_orders": 4, "schedules": 6},
            "schedules": [{"retailer_order_id": "x"}] * 3,
        },
        "plant-toronto",
    )
    assert "5" in text
    assert "plant-toronto" in text
    assert "/schedule" in text


def test_demo_agent_run_without_llm(monkeypatch):
    def _fake_invoke(_input):
        return {
            "totals": {"retailer_orders": 2, "supplier_orders": 1, "schedules": 3},
            "schedules": [],
        }

    monkeypatch.setattr(
        "agent.agents.demo.generate_demo_operations.invoke",
        _fake_invoke,
    )
    agent = DemoAgent()
    result = agent.run({"messages": [HumanMessage(content="Generate demo orders and schedules")]})
    assert result["messages"][-1].content
    assert "2" in result["messages"][-1].content
