.PHONY: up up.full down reset \
        schema.migrate schema.seed seed.lots seed.events \
        db.psql db.status \
        backend.install backend.run backend.test \
        agent.install agent.run agent.test \
        frontend.install frontend.run

# DB env (override via .env or shell)
POSTGRES_USER ?= bakery
POSTGRES_DB   ?= bakery

# --- Infra ---

up:
	docker compose up -d --wait postgres redis

up.full:
	docker compose --profile full up -d --build --wait

down:
	docker compose down

reset:
	docker compose down -v

# --- Schema / seed ---
# schema.migrate and schema.seed run inside the postgres container, applying
# files that are bind-mounted at /docker-entrypoint-initdb.d (see docker-compose.yml).
# On a fresh volume, the init dir auto-applies these on first boot too — so the
# typical first-time flow is just `make up`. After that, use migrate/seed to re-apply.

schema.migrate:
	docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U $(POSTGRES_USER) -d $(POSTGRES_DB) \
		-f /docker-entrypoint-initdb.d/schema.sql

schema.seed:
	docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U $(POSTGRES_USER) -d $(POSTGRES_DB) \
		-f /docker-entrypoint-initdb.d/seed.sql
	uv run infra/seed_lots.py

seed.lots:
	uv run infra/seed_lots.py

seed.events:
	uv run infra/event_stream.py

# Convenience: open a psql shell against the running postgres container.
db.psql:
	docker compose exec postgres psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)

# Quick row counts to verify a healthy seed.
db.status:
	@docker compose exec -T postgres psql -U $(POSTGRES_USER) -d $(POSTGRES_DB) -c "\
		SELECT 'facilities' AS table, count(*) FROM facilities \
		UNION ALL SELECT 'suppliers',         count(*) FROM suppliers \
		UNION ALL SELECT 'retailers',         count(*) FROM retailers \
		UNION ALL SELECT 'ingredients',       count(*) FROM ingredients \
		UNION ALL SELECT 'skus',              count(*) FROM skus \
		UNION ALL SELECT 'production_lines',  count(*) FROM production_lines \
		UNION ALL SELECT 'production_formulas', count(*) FROM production_formulas \
		UNION ALL SELECT 'warehouse_costs',   count(*) FROM warehouse_costs \
		UNION ALL SELECT 'allergen_changeovers', count(*) FROM allergen_changeovers \
		UNION ALL SELECT 'retailer_orders',   count(*) FROM retailer_orders \
		UNION ALL SELECT 'ingredient_lots',   count(*) FROM ingredient_lots \
		UNION ALL SELECT 'inventory_events',  count(*) FROM inventory_events;"

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
