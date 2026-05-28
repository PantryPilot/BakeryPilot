# Deployment — single Ubuntu VM behind nginx

How to deploy the BakeryPilot stack on a single Ubuntu VM (e.g. OpenStack with
a floating IP) so the app is reachable at `http://<PUBLIC_IP>/`. The full
production override lives at the repo root in `docker-compose.prod.yml`; this
doc is the runbook around it.

For an architecture overview see [architecture.md](architecture.md). For the
URLs once it's running see [services.md](services.md).

---

## At a glance

```
PUBLIC_IP
   │
   ▼  :80 (only public port)
┌──────────────┐
│    nginx     │   /         → frontend:3000
│              │   /api/*    → backend:8000
│              │   /healthz  → backend:8000
│              │   /docs     → backend:8000
└──────┬───────┘   /redoc    → backend:8000
       │
       │ docker bridge (bakery-pilot_default)
       ▼
┌───────────────────────────────────────────────┐
│  frontend  backend  postgres  redis  mongo    │  internal-only
│   :3000     :8000     :5432    :6379  :27017  │  (no host port maps)
└───────────────────────────────────────────────┘
```

Key facts:

- The **agent is in-process inside the backend container**. There is no
  standalone agent service in production — the dev compose's `agent` service
  is disabled because its entrypoint (`python -m agent.graph`) is a smoke
  test that exits.
- `NEXT_PUBLIC_BACKEND_URL` is **baked into the frontend JS at build time**.
  Changing the IP or domain after deploy requires `--build frontend`.
- All databases stay on the internal Docker network. Browse them via the
  built-in `/admin` UI or the FastAPI `/api/admin/*` endpoints — never expose
  Postgres/Redis/Mongo ports to the internet with default credentials.

---

## Prerequisites

| Requirement | Why |
| --- | --- |
| Ubuntu 22.04 or 24.04 | Tested base |
| Docker Engine ≥ 24 + compose plugin v2 | Runs the whole stack |
| Public IP or DNS name | What `PUBLIC_ORIGIN` will point at |
| OpenStack security group: TCP 22 (admin CIDR), TCP 80 + 443 (`0.0.0.0/0`) | The only ports that must be open from outside the VM |
| `ANTHROPIC_API_KEY` | Required for `/api/chat`; the rest of the stack works without it |

No GPU is needed. The repo is explicitly CPU-only — LightGBM, Prophet,
OR-Tools, and faster-whisper all run on commodity CPUs.

---

## Files that drive the deployment

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | Dev compose. Bind-mounts schema/seed, publishes DB ports to localhost. |
| `docker-compose.prod.yml` | Production override. Adds Dockerfiles, hides DB ports, adds nginx, disables the smoke-test `agent` service, sets restart policies. |
| `backend/Dockerfile` | Multi-stage uv build. **Context must be the repo root** because `backend/pyproject.toml` path-deps on `../agent`. |
| `frontend/Dockerfile` | Multi-stage Next.js build. Reads `NEXT_PUBLIC_BACKEND_URL` from a `--build-arg`. |
| `nginx/nginx.conf` | Path routing + SSE-friendly proxy settings (`proxy_buffering off`, long `proxy_read_timeout`). |
| `.env` | Single source of runtime configuration. Loaded by every container via `env_file`. |

---

## First-time deployment (fresh Ubuntu VM)

### 1. System prep

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install ca-certificates curl gnupg ufw git make jq
```

### 2. Install Docker

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

Cap container log size so a chatty service can't fill the disk:

```bash
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }
EOF
sudo systemctl restart docker
```

### 3. Host firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw default deny incoming
sudo ufw default allow outgoing
yes | sudo ufw enable
```

UFW is defense-in-depth on top of the OpenStack security group. Both must
allow the same ports.

### 4. Get the repo

```bash
cd /opt
sudo git clone <repo-url> BakeryPilot
sudo chown -R $USER:$USER BakeryPilot
cd BakeryPilot
```

### 5. Configure `.env`

Copy the example and edit the values that matter for a public deployment:

```bash
cp .env.example .env
PUBLIC_IP=$(curl -s https://api.ipify.org)
cat >> .env <<EOF

# Public URL of the nginx ingress on this VM. Consumed by docker-compose.prod.yml
# for the frontend build arg NEXT_PUBLIC_BACKEND_URL and the backend's runtime
# ALLOWED_ORIGINS.
PUBLIC_ORIGIN=http://${PUBLIC_IP}
EOF

# Extend CORS allowlist to include the public origin.
sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=http://localhost:3000,http://${PUBLIC_IP}|" .env
```

Then open `.env` and:

- set `ANTHROPIC_API_KEY` (required for `/api/chat`),
- rotate `POSTGRES_PASSWORD` if you plan to ever expose the DB,
- leave the `*_USE_MOCK=true` flags alone unless you're wiring real SAP/MES/CMMS clients.

### 6. Build and run

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

On first boot, Postgres auto-applies `infra/supabase/schema.sql` and
`infra/supabase/seed.sql` via the init-dir bind mount.

### 7. Verify

```bash
curl -s http://localhost/healthz                               # {"status":"ok"}
curl -s http://${PUBLIC_IP}/api/lots | jq '. | length'         # 180 (after seed)
timeout 6 curl -Ns http://${PUBLIC_IP}/api/events              # 5 SSE events
```

Open `http://${PUBLIC_IP}/` in a browser to see the FlowSight cockpit.

### 8. (Optional) Populate Faker lots

The init dir runs SQL only. To regenerate 180 ingredient lots via Faker:

```bash
# Easiest: run on the host with uv installed
uv run backend/scripts/seed_lots.py

# Or from inside the backend container (scripts ship with the backend image)
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec backend uv run scripts/seed_lots.py
```

---

## Updating after a code change

```bash
# Pull/edit code …
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build backend
# or, to rebuild everything:
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Common targeted rebuilds:

| Changed | Command |
| --- | --- |
| `backend/` or `agent/` code | `up -d --build backend` |
| `frontend/` code | `up -d --build frontend` |
| `nginx/nginx.conf` | `restart nginx` (or `up -d nginx`) |
| `.env` (runtime values) | `up -d` (recreates containers) |
| `PUBLIC_ORIGIN` in `.env` | `up -d --build frontend` (URL is baked into the JS bundle) |

---

## Operational quick reference

```bash
cd /opt/BakeryPilot   # or wherever you cloned to

PROD="-f docker-compose.yml -f docker-compose.prod.yml"

docker compose $PROD ps                          # status
docker compose $PROD logs -f backend             # tail backend logs
docker compose $PROD logs --tail=200 nginx
docker compose $PROD restart backend
docker compose $PROD down                        # stop, keep volumes
docker compose $PROD down -v                     # stop, delete volumes (destructive)
docker compose $PROD exec postgres psql -U bakery -d bakery
docker compose $PROD exec backend uv run pytest  # run tests in-container
docker stats --no-stream                         # resource snapshot
```

---

## TLS / HTTPS

Today the deployment is HTTP-only on `:80`. When you want HTTPS:

1. Point a DNS A record at the public IP.
2. Update `.env`: `PUBLIC_ORIGIN=https://your-domain`, regenerate `ALLOWED_ORIGINS` to match.
3. Pick one:
   - **Certbot + nginx.** Mount `/etc/letsencrypt` into the nginx container, run
     `certbot certonly --webroot` on the host, add a 443 server block.
   - **nginx-proxy + acme-companion sidecars.** Drop-in for auto-HTTPS via
     Docker labels.
   - **External terminator.** OpenStack Octavia, Cloudflare, or a load
     balancer in front of the VM. Nginx then only serves :80 inside the trust
     boundary.
4. Uncomment the `443:443` line in `docker-compose.prod.yml`.
5. `docker compose $PROD up -d --build` to rebuild the frontend with the new
   public origin.

---

## Changing the public IP or domain

```bash
sed -i "s|^PUBLIC_ORIGIN=.*|PUBLIC_ORIGIN=http://<new>|" .env
sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=http://localhost:3000,http://<new>|" .env
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build frontend backend
```

The frontend image must be rebuilt because `NEXT_PUBLIC_BACKEND_URL` is baked
in at `next build` time. The backend just needs an env reload to pick up the
new CORS allowlist.

---

## Troubleshooting

| Symptom | First check | Likely fix |
| --- | --- | --- |
| `502 Bad Gateway` from nginx | `docker compose $PROD logs backend` | Backend crash on startup (often a DB connection issue). |
| Chat hangs, then dumps all output at once | `nginx.conf` has `proxy_buffering off`? | Without it nginx buffers the entire SSE response. |
| `CORS error` in browser console | `docker compose $PROD exec backend env \| grep ALLOWED_ORIGINS` | Browser's origin must match an entry in `ALLOWED_ORIGINS`. |
| `Failed to fetch` from the browser, but `curl` works | Devtools network tab: is the URL `http://localhost:8000/...`? | Frontend was built without `NEXT_PUBLIC_BACKEND_URL`. Rebuild with the build arg. |
| Postgres complains "role does not exist" | `docker compose $PROD logs postgres` | Volume was created with different `POSTGRES_USER`. `down -v` to wipe (destructive) or fix `.env` to match. |
| `agent error: ...invalid x-api-key...` in chat response | `.env` `ANTHROPIC_API_KEY` value | Real Anthropic key required; placeholder won't work. |
| `connect ECONNREFUSED postgres:5432` in backend logs | `docker compose $PROD ps` | Postgres not healthy yet. Compose's `depends_on: condition: service_healthy` normally handles this. |
| Build fails: `path "../agent" not found` | Build context | Must be repo root. Use `docker-compose.prod.yml` (sets `context: .`). |
| Build fails: `COPY ... /app/public: not found` | Frontend Dockerfile | The repo has no `public/` dir. The Dockerfile mitigates this with `mkdir -p public` in the build stage; if you regenerated it, re-add that line. |

### Debugging commands worth keeping in muscle memory

```bash
# Is nginx reaching the backend on the docker network?
docker compose $PROD exec nginx wget -qO- http://backend:8000/healthz

# What does the backend think its CORS allowlist is?
docker compose $PROD exec backend python -c \
  "from app.config import settings; print(settings.origins_list)"

# Confirm DB / Redis / Mongo are NOT bound on the host
sudo ss -tlnp | grep -E ':(80|3000|8000|5432|6379|27017)\s'

# Validate the merged compose config without running it
docker compose -f docker-compose.yml -f docker-compose.prod.yml config | less
```

---

## Backups

The only volume you can't rebuild is `bakery-pilot-postgres-data`.

```bash
# Dump
docker compose $PROD exec -T postgres \
  pg_dump -U bakery -Fc bakery > backup-$(date +%F).dump

# Restore (into a fresh stack)
cat backup-2026-05-27.dump | \
  docker compose $PROD exec -T postgres pg_restore -U bakery -d bakery --clean --if-exists
```

Redis and Mongo are rebuildable from seeds and the prompt `.md` files.
