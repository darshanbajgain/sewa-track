# API image. Build from the REPO ROOT (it needs the workspace files and packages/shared):
#   docker build -f apps/api/Dockerfile -t sewa-api .
#
# Multi-stage: the "build" stage has the compiler and dev dependencies; the final stage gets only
# the compiled JavaScript and production dependencies. Smaller image, fewer packages to attack.

# ---- base: Node + pnpm, and only the dependency manifests ----
FROM node:22-alpine AS base
WORKDIR /repo
# pnpm comes from Corepack, at the exact version in package.json "packageManager".
RUN corepack enable
# Copy only the manifests first. Docker caches this layer, so `pnpm install` re-runs only when a
# package.json or the lockfile changes, not on every code change.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# ---- build: all dependencies (TypeScript etc.), compile shared + api ----
FROM base AS build
# `@sewa/api...` = the api AND the workspace packages it depends on (@sewa/shared).
RUN pnpm install --frozen-lockfile --filter @sewa/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @sewa/shared build && pnpm --filter @sewa/api build

# ---- prod-deps: production dependencies only (no TypeScript, Vitest, tsx) ----
FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter @sewa/api...

# ---- runtime: what actually runs ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
# Same folder layout as the repo, so pnpm's relative links (apps/api/node_modules → /repo/node_modules/.pnpm)
# keep working. --chown: files belong to the built-in non-root "node" user.
WORKDIR /repo
COPY --from=prod-deps --chown=node:node /repo/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=prod-deps --chown=node:node /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /repo/packages/shared/package.json ./packages/shared/
COPY --from=build --chown=node:node /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=node:node /repo/apps/api/package.json ./apps/api/
COPY --from=build --chown=node:node /repo/apps/api/dist ./apps/api/dist
# Migrations and the demo seed data, used by the release step (see the end of this file).
COPY --from=build --chown=node:node /repo/apps/api/db ./apps/api/db
WORKDIR /repo/apps/api
# Never run as root: if the app were ever exploited, the attacker would not own the container.
USER node
EXPOSE 4000
# Docker (and docker compose) mark the container unhealthy if /health stops answering.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:${PORT:-4000}/api/v1/health || exit 1
# Plain `node`, not `pnpm start`: node gets SIGTERM directly, so graceful shutdown works.
CMD ["node", "dist/server.js"]
# Release step (once per deploy, before the new version takes traffic), same image, other command:
#   node dist/db/migrate.cli.js          and for the demo data:   node dist/db/seed.cli.js
