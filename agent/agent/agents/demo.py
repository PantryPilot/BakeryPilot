from __future__ import annotations

import re

from langchain_core.messages import AIMessage, HumanMessage

from agent.tools.demo_tools import generate_demo_operations

_FACILITY_ALIASES: dict[str, str] = {
    "toronto": "plant-toronto",
    "hamilton": "plant-hamilton",
    "mississauga": "plant-mississauga",
    "montreal": "plant-montreal",
    "plant-toronto": "plant-toronto",
    "plant-hamilton": "plant-hamilton",
    "plant-mississauga": "plant-mississauga",
    "plant-montreal": "plant-montreal",
}


def _parse_facility(text: str) -> str | None:
    lower = text.lower()
    for alias, facility_id in _FACILITY_ALIASES.items():
        if alias in lower:
            return facility_id
    match = re.search(r"plant-[a-z]+", lower)
    if match:
        return match.group(0)
    return None


def _format_summary(result: dict, facility_id: str | None) -> str:
    totals = result.get("totals", {})
    retailer_n = totals.get("retailer_orders", 0)
    supplier_n = totals.get("supplier_orders", 0)
    schedule_n = totals.get("schedules", 0)
    scope = f" for **{facility_id}**" if facility_id else " across all plants"

    lines = [
        f"Generated demo data{scope}:",
        f"- **{retailer_n}** open retailer POs",
        f"- **{supplier_n}** confirmed supplier POs",
        f"- **{schedule_n}** production schedules (approved + suggested)",
        "",
        "View the results:",
        "- Production Gantt + retailer POs → `/schedule`",
        "- Supplier POs → `/scorecard`",
        "- Inbound/outbound map flows → `/facilities`",
    ]

    schedules = result.get("schedules") or []
    linked = sum(1 for s in schedules if s.get("retailer_order_id"))
    if linked:
        lines.insert(4, f"- **{linked}** schedules linked to retailer POs")

    return "\n".join(lines)


class DemoAgent:
    """Deterministic demo-data agent — no LLM required."""

    def run(self, state: dict) -> dict:
        last_user = next(
            (m for m in reversed(state["messages"]) if isinstance(m, HumanMessage)),
            None,
        )
        user_text = str(last_user.content) if last_user else ""

        facility_id = _parse_facility(user_text)
        tool_input: dict = {
            "retailer_order_count": 5,
            "supplier_order_count": 4,
            "schedule_count": 6,
        }
        if facility_id:
            tool_input["facility_id"] = facility_id

        try:
            result = generate_demo_operations.invoke(tool_input)
            content = _format_summary(result, facility_id)
        except Exception as exc:
            content = (
                f"Could not generate demo data: {exc}\n\n"
                "Ensure the backend is running and base seed data is loaded (`make schema.seed`)."
            )

        return {
            **state,
            "messages": [*state["messages"], AIMessage(content=content)],
        }
