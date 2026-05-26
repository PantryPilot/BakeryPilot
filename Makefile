.PHONY: up up.full down reset \
        schema.migrate schema.seed seed.lots seed.events seed.demo seed.toronto seed.toronto.retailers \
        db.psql db.status \
        backend.install backend.run backend.test \
        agent.install agent.run agent.test \
        frontend.install frontend.run

# DB env (override via .env or shell)
POSTGRES_USER ?= bakery
POSTGRES_DB   ?= bakery

# uv command — use `python -m uv` if uv is not on PATH
UV ?= python -m uv

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
	$(UV) run infra/seed_lots.py

seed.lots:
	$(UV) run infra/seed_lots.py

seed.events:
	$(UV) run infra/event_stream.py

seed.demo:
	$(UV) run infra/seed_demo.py

seed.toronto:
	$(UV) run infra/seed_toronto_suppliers.py

seed.toronto.retailers:
	$(UV) run infra/seed_toronto_retailers.py

# Convenience: open a psql shell against the running postgres container.
db.psql:
	docker compose exec postgres psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)

# Quick row counts to verify a healthy seed.
db.status:
	@docker compose exec -T postgres psql -U $(POSTGRES_USER) -d $(POSTGRES_DB) -c "\
		SELECT 'facilities' AS table, count(*) FROM facilities \
		UNION ALL SELECT 'suppliers',              count(*) FROM suppliers \
		UNION ALL SELECT 'ingredients',            count(*) FROM ingredients \
		UNION ALL SELECT 'skus',                   count(*) FROM skus \
		UNION ALL SELECT 'production_lines',       count(*) FROM production_lines \
		UNION ALL SELECT 'ingredient_lots',        count(*) FROM ingredient_lots \
		UNION ALL SELECT 'retailer_orders',        count(*) FROM retailer_orders \
		UNION ALL SELECT 'demand_forecasts',       count(*) FROM demand_forecasts \
		UNION ALL SELECT 'disruption_signals',     count(*) FROM disruption_signals \
		UNION ALL SELECT 'stakeholders',           count(*) FROM stakeholders \
		UNION ALL SELECT 'production_schedules',   count(*) FROM production_schedules \
		UNION ALL SELECT 'production_runs',        count(*) FROM production_runs \
		UNION ALL SELECT 'supplier_orders',        count(*) FROM supplier_orders \
		UNION ALL SELECT 'action_cards',           count(*) FROM action_cards \
		UNION ALL SELECT 'waste_events',           count(*) FROM waste_events \
		UNION ALL SELECT 'finished_goods_pallets', count(*) FROM finished_goods_pallets \
		UNION ALL SELECT 'moq_tax_ledger',         count(*) FROM moq_tax_ledger \
		UNION ALL SELECT 'negotiation_drafts',     count(*) FROM negotiation_drafts \
		UNION ALL SELECT 'dock_schedules',         count(*) FROM dock_schedules \
		UNION ALL SELECT 'weekly_summaries',       count(*) FROM weekly_summaries;"

# --- Backend ---

backend.install:
	cd backend && $(UV) sync

backend.run:
	cd backend && $(UV) run uvicorn app.main:app --reload --port 8000

backend.test:
	cd backend && $(UV) run pytest

# --- Agent ---

agent.install:
	cd agent && $(UV) sync

agent.run:
	cd agent && $(UV) run python -m agent.graph

agent.test:
	cd agent && $(UV) run pytest

# --- Frontend ---

frontend.install:
	cd frontend && npm install

frontend.run:
	cd frontend && npm run dev
