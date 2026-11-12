# Mock National ID service image (PRD F9). Build from the REPO ROOT (it needs packages/shared):
#   docker build -f apps/nid-mock/Dockerfile -t sewa-nid-mock .
# Same multi-stage pattern as apps/api/Dockerfile, just smaller.

FROM node:22-alpine AS base
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/nid-mock/package.json apps/nid-mock/

FROM base AS build
RUN pnpm install --frozen-lockfile --filter @sewa/nid-mock...
COPY packages/shared packages/shared
COPY apps/nid-mock apps/nid-mock
RUN pnpm --filter @sewa/shared build && pnpm --filter @sewa/nid-mock build

FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter @sewa/nid-mock...

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=prod-deps --chown=node:node /repo/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=prod-deps --chown=node:node /repo/apps/nid-mock/node_modules ./apps/nid-mock/node_modules
COPY --from=build --chown=node:node /repo/packages/shared/package.json ./packages/shared/
COPY --from=build --chown=node:node /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=node:node /repo/apps/nid-mock/package.json ./apps/nid-mock/
COPY --from=build --chown=node:node /repo/apps/nid-mock/dist ./apps/nid-mock/dist
WORKDIR /repo/apps/nid-mock
USER node
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:${PORT:-4100}/health || exit 1
CMD ["node", "dist/server.js"]
