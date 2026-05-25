.PHONY: up up.full down reset \
        schema.migrate schema.seed seed.lots seed.events \
        backend.install backend.run backend.test \
        agent.install agent.run agent.test \
        frontend.install frontend.run

# --- Infra ---

up:
	docker compose up -d postgres redis

up.full:
	docker compose --profile full up -d --build

down:
	docker compose down

reset:
	docker compose down -v

# --- Schema / seed ---

schema.migrate:
	@echo "TODO: apply infra/supabase/schema.sql"

schema.seed:
	@echo "TODO: apply infra/supabase/seed.sql and run infra/seed_lots.py"

seed.lots:
	@echo "TODO: regenerate ingredient lots"

seed.events:
	@echo "TODO: start Redis event stream publisher (infra/event_stream.py)"

# --- Backend ---

backend.install:
	cd backend && uv sync

backend.run:
	cd backend && uv run uvicorn app.main:app --reload --port 8000

backend.test:
	cd backend && uv run pytest

# --- Agent ---

agent.install:
	cd agent && uv sync

agent.run:
	cd agent && uv run python -m agent.graph

agent.test:
	cd agent && uv run pytest

# --- Frontend ---

frontend.install:
	cd frontend && npm install

frontend.run:
	cd frontend && npm run dev
