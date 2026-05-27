# syntax=docker/dockerfile:1.7
# Build context = repo root (mirrors backend Dockerfile so the override
# can use a single context for both images).

# --- build stage ---
FROM node:20-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./

# Ensure public/ exists so the runtime stage can COPY it unconditionally
# (this repo has no public/ directory).
RUN mkdir -p public

# NEXT_PUBLIC_BACKEND_URL is baked into the JS at `next build` time.
# Pass it via --build-arg or the `args:` block in docker-compose.prod.yml.
ARG NEXT_PUBLIC_BACKEND_URL=""
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL

RUN npm run build

# --- runtime stage ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/.next        ./.next
COPY --from=build /app/public       ./public
COPY --from=build /app/next.config.mjs ./

RUN npm ci --omit=dev

EXPOSE 3000
CMD ["npm", "run", "start"]
