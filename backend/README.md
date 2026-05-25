# backend

FastAPI + Pydantic v2 backend for BakeryPilot. See the repo README for context.

## Structure

- `app/main.py` -- FastAPI app entrypoint
- `app/api/` -- one router per domain (inventory, suppliers, schedules, ...)
- `app/services/` -- business logic (procurement.py, scheduler.py, ...)
- `app/db/` -- SQLAlchemy models and session
- `app/integrations/` -- SAP mock, MES mock, CMMS mock (mock and real share an interface)

## Run

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8000
```
