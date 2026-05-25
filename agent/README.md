# agent

LangGraph multi-agent orchestrator for BakeryPilot. See the repo README for context.

## Structure

- `agent/graph.py` -- stateful graph definition
- `agent/state.py` -- AgentState pydantic model
- `agent/tools/` -- one file per tool; thin HTTP wrappers over backend
- `agent/prompts/` -- system and intent-classification prompts

## Run

```bash
uv sync
uv run python -m agent.graph
```
