def test_inventory_tools_importable():
    from agent.tools import inventory_tools  # noqa: F401


def test_scheduler_tools_importable():
    from agent.tools import scheduler_tools  # noqa: F401


def test_procurement_tools_importable():
    from agent.tools import procurement_tools  # noqa: F401


def test_yield_tools_importable():
    from agent.tools import yield_tools  # noqa: F401


def test_esg_tools_importable():
    from agent.tools import esg_tools  # noqa: F401


def test_demo_tools_importable():
    from agent.tools import demo_tools  # noqa: F401


def test_agent_state_instantiable():
    from agent.state import AgentState
    state = AgentState(messages=[])
    assert state.get("intent") is None
    assert state.get("tool_results", []) == []
    assert state.get("action_cards", []) == []
