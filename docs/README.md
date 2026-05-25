# BakeryPilot — Architecture Docs

Reference docs for how BakeryPilot is built. Diagrams use [Mermaid](https://mermaid.js.org)
and render directly in GitHub.

| Doc | What's inside |
| --- | --- |
| [architecture.md](architecture.md) | The full system at a glance — services, ports, tech stack, the walking-skeleton path |
| [backend.md](backend.md) | FastAPI layout: routers, services, integrations, mock parity |
| [agents.md](agents.md) | LangGraph orchestrator + specialist agents, tools, prompt store, LLM tier |
| [frontend.md](frontend.md) | Next.js 15 app structure: pages, components, typed API client, SSE handling |
| [database.md](database.md) | Postgres schema by domain, append-only audit tables, phase-by-phase additions |
| [data-flow.md](data-flow.md) | End-to-end sequence diagrams: chat → tool → action_card → confirm → DB write |

## Where each doc starts

- **New to the project?** Read [architecture.md](architecture.md) first, then
  [data-flow.md](data-flow.md) to see the walking-skeleton in action.
- **Working on the backend?** Start at [backend.md](backend.md). The DB shape lives
  in [database.md](database.md).
- **Working on the agent?** [agents.md](agents.md) covers the LangGraph topology
  and where tools call into the backend.
- **Working on the UI?** [frontend.md](frontend.md). The agent ↔ UI contract is
  the SSE event stream documented in [data-flow.md](data-flow.md).

## Source of truth

These docs describe the system at the time of writing. The authoritative sources are:

- Code under `backend/`, `agent/`, `frontend/`, `infra/`
- Cross-service contracts: `shared/schemas/*.schema.json`
- Operational status of each task: [`TASKS.md`](../TASKS.md)
- Setup and run instructions: [`README.md`](../README.md)

If a diagram drifts from the code, the code wins. Open an issue or fix the doc.
