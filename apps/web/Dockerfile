# Web image. Build from the REPO ROOT:
#   docker build -f apps/web/Dockerfile --build-arg API_ORIGIN=http://api:4000 -t sewa-web .
#
# API_ORIGIN is a BUILD argument: Next.js writes the /api/* rewrite into the build output, so the
# API's address must be known when the image is built, not only when it runs.

FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @sewa/web...
COPY packages/shared packages/shared
COPY apps/web apps/web
ARG API_ORIGIN=http://api:4000
ENV API_ORIGIN=${API_ORIGIN} BUILD_STANDALONE=true NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @sewa/shared build && pnpm --filter @sewa/web build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
# The standalone folder already has server.js and the few node_modules it traced as needed.
# Static assets and public/ are not included by Next.js, so copy them next to it.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
