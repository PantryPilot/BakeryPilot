def test_inventory_tools_importable():
    from agent.agent.tools import inventory_tools  # noqa: F401


def test_scheduler_tools_importable():
    from agent.agent.tools import scheduler_tools  # noqa: F401


def test_procurement_tools_importable():
    from agent.agent.tools import procurement_tools  # noqa: F401


def test_yield_tools_importable():
    from agent.agent.tools import yield_tools  # noqa: F401


def test_esg_tools_importable():
    from agent.agent.tools import esg_tools  # noqa: F401


def test_agent_state_instantiable():
    from agent.agent.state import AgentState
    state = AgentState(messages=[])
    assert state.intent is None
    assert state.tool_results == []
    assert state.action_cards == []
