# syntax=docker/dockerfile:1.7
# Build context MUST be the repo root, because backend/pyproject.toml has
# bakery-pilot-agent = { path = "../agent" } and uv needs to see both trees.

FROM python:3.11-slim AS base
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_LINK_MODE=copy

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# uv: same package manager the Makefile uses.
RUN pip install --no-cache-dir uv==0.5.*

WORKDIR /app
COPY agent/   /app/agent/
COPY backend/ /app/backend/

WORKDIR /app/backend
RUN uv sync --frozen --no-dev

EXPOSE 8000

# --proxy-headers + --forwarded-allow-ips lets uvicorn trust the X-Forwarded-* set by nginx.
CMD ["uv", "run", "uvicorn", "app.main:app", \
     "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips=*"]
