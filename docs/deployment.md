# Deployment

How Sewa Track is packaged and run outside `pnpm dev`. Hosting for the public demo is chosen in P8
(PRD §11); this page covers what is the same on every host.

## 1. Two images

| Image | Dockerfile | Runs | Size |
|---|---|---|---|
| `sewa-api` | [apps/api/Dockerfile](../apps/api/Dockerfile) | `node dist/server.js` (Express API) | ~190 MB |
| `sewa-web` | [apps/web/Dockerfile](../apps/web/Dockerfile) | `node apps/web/server.js` (Next.js standalone) | ~230 MB |

Both are built from the **repo root**, because they need the workspace files and `packages/shared`.

Rules both follow:
- **Multi-stage.** The build stage has TypeScript and the dev dependencies. The final stage gets only the
  compiled JavaScript and production dependencies (the API image has no TypeScript, Vitest or tsx).
- **Non-root.** The final stage runs as the built-in `node` user (uid 1000).
- **Cached installs.** The `package.json` files and the lockfile are copied before the source code, so
  `pnpm install` re-runs only when dependencies change. `--frozen-lockfile` installs exactly what CI tested.
- **`node`, not `pnpm start`.** Node receives the platform's SIGTERM directly, so the API's graceful
  shutdown (finish in-flight requests, close the pool) works on every deploy.
- **HEALTHCHECK.** Docker marks a container unhealthy when `/api/v1/health` (API) or `/` (web) stops answering.
- **[.dockerignore](../.dockerignore)** keeps `.env`, `.git`, `node_modules`, private docs and agent files
  out of the build context, so they can never end up in an image.

Why the API image keeps the repo's folder layout (`/repo/apps/api`, `/repo/packages/shared`): pnpm links
`@sewa/shared` with a relative symlink. With the same layout, the link works without extra tools.

Why the web image uses Next.js **standalone** output: `next build` traces the files the server really
imports and writes a small `server.js` plus only those `node_modules`. The Dockerfile turns it on with
`BUILD_STANDALONE=true`; local `next start` is unchanged.

## 2. The release step (migrations)

Migrations run **once per deploy, before the new API version takes traffic**, from the same image with another command:

```bash
node dist/db/migrate.cli.js    # apply new migrations (refuses edited ones: checksums)
node dist/db/seed.cli.js       # demo reference data + demo accounts (every insert is an upsert, safe to re-run)
```

In docker compose this is the `migrate` service. The `api` service waits for it with
`condition: service_completed_successfully`, so a new API never runs against an old schema.

## 3. Run everything in containers

```bash
cp .env.example .env     # once; set a real JWT_SECRET
docker compose up --build
```

Open <http://localhost:8080>. The API port is **not** published: the browser reaches the API only through
the web app's `/api/*` rewrite, the same as in production (one origin, so the `SameSite=Lax` cookie works
and no CORS is needed). The containers run with `NODE_ENV=production`, so the cookie is `Secure`
(browsers accept that on `localhost`).

`docker compose up -d db` still starts only the database for normal `pnpm dev` work.

## 4. Settings

API (validated at startup in [config/env.ts](../apps/api/src/config/env.ts); a bad value stops the app):

| Variable | Example | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Turns on `Secure` cookies; refuses the example `JWT_SECRET` |
| `DATABASE_URL` | `postgres://…` | Secret |
| `JWT_SECRET` | 48 random bytes | Secret. At least 32 characters |
| `TRUST_PROXY` | `1` | Number of proxies in front of the API (see §5) |
| `PORT` | `4000` | Most hosts set it |
| `API_DOCS_ENABLED` | `true` | Swagger UI at `/api/docs` |
| `APP_VERSION`, `GIT_COMMIT` | `0.1.0`, `ef62e0d` | Shown by `/health`, to tell which build is live |

Web:

| Variable | When | Notes |
|---|---|---|
| `API_ORIGIN` | **build time** | Where `/api/*` is forwarded. Next.js writes rewrites into the build output, so it is a Docker build argument |

## 5. Real client IPs and the rate limits

The login, sign-up and tracking limits count requests **per IP**. Behind proxies, Express would see the
proxy's IP for every user, so everyone would share one counter: one person could lock login for all.

`TRUST_PROXY=N` tells Express to trust N proxies and read the client IP from `X-Forwarded-For`, counting
from the right. Each trusted proxy appends the address it received the request from. Entries further
left were written by the client and could be fake, so N must match the real number of proxies:

| Setup | Proxies in front of the API | `TRUST_PROXY` |
|---|---|---|
| `pnpm dev`, tests (every request comes from localhost anyway) | not counted | `0` |
| docker compose (browser → web → API) | the web container | `1` |
| Host edge → web → API on the same host | edge (appends the real IP); Next.js passes it on | `1` |
| Host edge → web → **another host's** edge → API | two | `2` |

Known limit, local only: Next.js keeps an `X-Forwarded-For` that a client sent instead of replacing it.
With no edge proxy in front (docker compose), a client can therefore fake its IP and dodge the limits.
On a real host the edge proxy appends the true IP last, and that last entry is the one the API reads.
This is checked after deploy (P8 smoke test).
