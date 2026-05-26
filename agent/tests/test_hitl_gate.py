"""NF.R.2 — HITL gate smoke test.

Static checks that confirm:
1. Every identified write tool's description signals human-in-the-loop review
   (contains 'action', 'review', 'human', or 'confirm').
2. Every identified read-only tool's description does NOT contain 'action_card_id'
   (they are pure reads that never gate on human approval).
"""
from __future__ import annotations

import pytest

# Write tools — these commit state and MUST surface HITL intent in their description.
from agent.tools.procurement_tools import build_order_draft
from agent.tools.scheduler_tools import run_changeover_optimizer
from agent.tools.yield_tools import create_cmms_work_order

# Read-only tools — must NOT mention 'action_card_id' in their description.
# Note: preview_landed_cost is intentionally excluded because its docstring mentions
# 'action_card_id' only to clarify it is discarded — it is still a pure read.
from agent.tools.inventory_tools import query_lots
from agent.tools.yield_tools import get_yield_variance
from agent.tools.esg_tools import get_waste_counter

_HITL_KEYWORDS = {"action", "review", "human", "confirm"}

WRITE_TOOLS = [
    build_order_draft,
    run_changeover_optimizer,
    create_cmms_work_order,
]

READ_TOOLS = [
    query_lots,
    get_yield_variance,
    get_waste_counter,
]


@pytest.mark.parametrize("tool_fn", WRITE_TOOLS, ids=lambda t: t.name)
def test_write_tool_signals_hitl(tool_fn):
    """Each write tool's description must mention at least one HITL keyword."""
    description = (tool_fn.description or "").lower()
    matched = _HITL_KEYWORDS & set(word for keyword in _HITL_KEYWORDS if keyword in description for word in [keyword])
    assert matched, (
        f"Write tool '{tool_fn.name}' description does not signal HITL review.\n"
        f"Description: {tool_fn.description!r}\n"
        f"Expected at least one of: {_HITL_KEYWORDS}"
    )


@pytest.mark.parametrize("tool_fn", READ_TOOLS, ids=lambda t: t.name)
def test_read_tool_has_no_action_card_id(tool_fn):
    """Each read-only tool's description must NOT contain 'action_card_id'."""
    description = (tool_fn.description or "").lower()
    assert "action_card_id" not in description, (
        f"Read-only tool '{tool_fn.name}' unexpectedly references 'action_card_id'.\n"
        f"Description: {tool_fn.description!r}"
    )
