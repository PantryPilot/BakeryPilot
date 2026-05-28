"""Unit tests for SchedulerAgent's action-card extraction and recovery.

These tests exercise the pure helpers (`_extract_action_card` and
`_recover_card_from_tool_messages`) without spinning up the LangGraph runtime.
Their job is to guarantee that when the LLM forgets to emit the
```action_card fence — but a draft_* tool *was* called — the agent still
surfaces the card id so the chat UI renders a confirm button.

Regression coverage for the bug where outbound shipment suggestions appeared
as text only, with no clickable action card.
"""
from __future__ import annotations

import json

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from agent.agents.scheduler import (
    _extract_action_card,
    _recover_card_from_tool_messages,
)


def _tool_msg(name: str, payload: dict | str) -> ToolMessage:
    content = payload if isinstance(payload, str) else json.dumps(payload)
    return ToolMessage(content=content, name=name, tool_call_id=f"call-{name}")


# ---------------------------------------------------------------------------
# _extract_action_card — fence parsing (happy path)
# ---------------------------------------------------------------------------

def test_extract_fence_with_real_id():
    msg = AIMessage(
        content=(
            "Drafting outbound shipment of 656 units to Costco.\n\n"
            "```action_card\n"
            '{"action_card_id": "abc-123"}\n'
            "```"
        )
    )
    assert _extract_action_card(msg) == {"action_card_id": "abc-123"}


def test_extract_fence_returns_none_when_absent():
    msg = AIMessage(content="Here is your action card — confirm to reserve pallets.")
    assert _extract_action_card(msg) is None


def test_extract_fence_returns_none_for_malformed_json():
    msg = AIMessage(content="```action_card\n{not json}\n```")
    assert _extract_action_card(msg) is None


# ---------------------------------------------------------------------------
# _recover_card_from_tool_messages — fallback when LLM skips the fence
# ---------------------------------------------------------------------------

def test_recover_from_draft_outbound_shipment():
    """The exact bug the user reported: LLM described a shipment but never
    emitted the fence. The draft tool DID run, so its action_card_id must
    still surface."""
    messages = [
        HumanMessage(content="Optimise outbound shipments from Toronto."),
        _tool_msg("suggest_outbound_shipments", [{"shipment_id": "s1"}]),
        _tool_msg("list_warehouse_stock", [{"sku_id": "sku-x", "available_units": 656}]),
        _tool_msg("draft_outbound_shipment", {
            "action_card_id": "card-outbound-7",
            "kind": "outbound_shipment",
            "title": "Outbound · sku-x → Costco",
        }),
        AIMessage(content="Here is your action card — confirm to reserve pallets."),
    ]
    assert _recover_card_from_tool_messages(messages) == {
        "action_card_id": "card-outbound-7"
    }


def test_recover_from_draft_schedule_change():
    messages = [
        _tool_msg("suggest_production_schedule", [{"schedule_id": "uuid"}]),
        _tool_msg("draft_schedule_change", {"action_card_id": "card-swap-1"}),
        AIMessage(content="Done."),
    ]
    assert _recover_card_from_tool_messages(messages) == {
        "action_card_id": "card-swap-1"
    }


def test_recover_from_draft_new_production_order():
    messages = [
        _tool_msg("draft_new_production_order", {"action_card_id": "card-new-9"}),
        AIMessage(content="Drafted."),
    ]
    assert _recover_card_from_tool_messages(messages) == {
        "action_card_id": "card-new-9"
    }


def test_recover_prefers_most_recent_draft():
    """If the agent drafted twice, take the latest one (matches what the
    LLM is most likely referring to in its final response)."""
    messages = [
        _tool_msg("draft_outbound_shipment", {"action_card_id": "old"}),
        _tool_msg("suggest_outbound_shipments", []),
        _tool_msg("draft_outbound_shipment", {"action_card_id": "new"}),
        AIMessage(content="..."),
    ]
    assert _recover_card_from_tool_messages(messages) == {"action_card_id": "new"}


def test_recover_ignores_read_only_tools():
    """A read tool's output shouldn't be mistaken for a draft."""
    messages = [
        _tool_msg("suggest_outbound_shipments", [{"action_card_id": "phantom"}]),
        AIMessage(content="Nothing to draft right now."),
    ]
    assert _recover_card_from_tool_messages(messages) is None


def test_recover_returns_none_when_no_draft_called():
    messages = [
        _tool_msg("list_warehouse_stock", [{"sku_id": "x", "available_units": 0}]),
        AIMessage(content="No actionable PO — stock is empty."),
    ]
    assert _recover_card_from_tool_messages(messages) is None


def test_recover_handles_non_json_tool_content():
    messages = [
        _tool_msg("draft_outbound_shipment", "raw error string"),
        AIMessage(content="Failed."),
    ]
    assert _recover_card_from_tool_messages(messages) is None


def test_recover_handles_missing_id_field():
    messages = [
        _tool_msg("draft_outbound_shipment", {"kind": "outbound_shipment"}),
        AIMessage(content="..."),
    ]
    assert _recover_card_from_tool_messages(messages) is None
