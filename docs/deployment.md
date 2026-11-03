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

**Live demo (until this runs automatically on deploy):** run the migration by hand against the hosted
database **before merging** a PR that adds one. New migrations only add things, so the old API keeps
working with the new schema, while the new API needs it. Keep the hosted `DATABASE_URL` in a gitignored
file (e.g. `.env.neon`) and run:

```bash
cd apps/api
env -u DATABASE_URL node --no-warnings --env-file=../../.env.neon --import tsx src/db/migrate.cli.ts
```

`env -u DATABASE_URL` matters: `--env-file` never replaces a variable that is already set, and some
editor terminals load `.env` automatically, so without it the command can silently migrate your *local*
database instead ("already applied" is the clue).

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
| `PROXY_SECRET` | 32+ random characters | Secret. Same value on the web app. Set = only the website can call the API (see §5) |
| `PORT` | `4000` | Most hosts set it |
| `API_DOCS_ENABLED` | `true` | Swagger UI at `/api/docs` |
| `APP_VERSION`, `GIT_COMMIT` | `0.1.0`, `ef62e0d` | Shown by `/health`, to tell which build is live |

Web:

| Variable | When | Notes |
|---|---|---|
| `API_ORIGIN` | **build time** | Where `/api/*` is forwarded. Next.js writes rewrites into the build output, so it is a Docker build argument. Missing on Vercel = the build fails (locally it falls back to `http://localhost:4000`) |
| `PROXY_SECRET` | run time | Same value as the API's. Server-only (no `NEXT_PUBLIC_`), so it never reaches the browser |

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

### Web and API on two hosts: one way in (`PROXY_SECRET`)
Found in the post-deploy test: through the website, the login limit never triggered.

```
direct:       client → API host's edge → API host's load balancer → API
via website:  client → web host → API host's edge → API host's load balancer → API
```

When the web host forwards a request to another host, the visitor's IP does **not** arrive in
`X-Forwarded-For`. The API only saw the web host's outgoing IP, which changes almost every request, so
every attempt looked like a new visitor. Tested: with `TRUST_PROXY` 2 or 3, and even with the same fake
`X-Forwarded-For` sent 7 times, no 429. No `TRUST_PROXY` number can find an IP that isn't there.

Fix: the web app reports the visitor's IP itself, and proves it is the web app.
- The web app's [proxy.ts](../apps/web/src/proxy.ts) adds two headers to every `/api` request it
  forwards: `X-Proxy-Secret` and `X-Client-IP` (from `x-real-ip`, which the web host's edge sets and a
  visitor can't override).
- The API ([middleware/proxySecret.ts](../apps/api/src/middleware/proxySecret.ts)) refuses requests without
  the right secret with `403`, except `/live` and `/health` (platform health check and keep-awake pinger).
- With the right secret, the rate limits count per `X-Client-IP`
  ([rateLimit.ts](../apps/api/src/middleware/rateLimit.ts)). Without a secret configured, the header is
  ignored, so nobody can pick their own counter.

`TRUST_PROXY` stays as the direct-path value (Render: `2`); with the secret on, it only affects `req.ip`
for `/live` and `/health`.

To rotate the secret: set a new value on both hosts, then redeploy both.

## 6. Free hosting: sleep and keep-awake

A free API host (e.g. Render's free plan) stops the API after **15 minutes without requests**, and the next
request waits about **a minute** while it starts again. Two parts handle this:

**1. Keep it awake: an outside pinger.** A free scheduled pinger (cron-job.org or UptimeRobot) calls
`GET /api/v1/live` every 10 minutes. Any request resets the 15-minute timer.
- `/live` **never touches the database** (a test checks this). If the pinger called `/health`, the
  database would be woken every 10 minutes too, and could never sleep and save its free compute hours.
  **Liveness** (`/live`: is the process running?) vs **readiness** (`/health`: can it serve real requests?).
- One service awake all month ≈ 744 hours, inside Render's 750 free hours. Only the API is kept awake.
- Not GitHub Actions `schedule`: its runs are often late and stop after 60 days without commits.
- **Live demo:** a cron-job.org job (owner's account) calls the Render API's `/api/v1/live` every 10 minutes,
  `GET`, alert after repeated failures. Checked 2026-11-03: every run 200 OK in about 1 s; `/live` answered in
  0.2–0.4 s, against 22.6 s from a sleeping API before the job existed.

**2. If it sleeps anyway: the web app explains and recovers** ([ServerWakeNotice.tsx](../apps/web/src/components/ServerWakeNotice.tsx)).
On each full page load it pings `/live`:
- answer within 3 s → nothing is shown (the normal case)
- slower → "Waking up the demo server…" (English + Nepali) under the demo banner
- it pings again every 2 s until the API answers (a proxy in between can cut a long request; our own
  Next.js rewrite does at 30 s), and gives up after 2 minutes (= a real outage; pages show their own errors)
- once the API answers after a slow start, queries that failed while it slept are fetched again, so the
  page fills in by itself

Tested with a fake sleeping API (a proxy that held every request for 40 s): the notice showed at 4 s;
the page's own requests timed out at 32 s while the notice stayed; at 40 s the notice went away and the map
loaded without a reload. With an awake API the notice never appeared.
