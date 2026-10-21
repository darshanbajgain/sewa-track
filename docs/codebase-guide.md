# Sewa Track: Codebase Guide

> **Demo / portfolio project. Not affiliated with any government body. Do not enter real information.**

This guide explains **what is in the repo, where it lives, and why it is built this way**.
Read it top to bottom once; after that, use it as a map.

- Scope and requirements: [`PRD.md`](./PRD.md)
- This guide is updated in the same change as the code it describes.

**Current status:** Phase P1 (skeleton) done. The API runs, connects to Postgres and serves `GET /api/v1/health`;
shared enums live in `packages/shared`; CI runs type-check, tests and build on every PR.
Everything else in the PRD is planned (see [§11](#11-build-phases-and-status)).

---

## Contents

1. [The big picture](#1-the-big-picture)
2. [Repository map](#2-repository-map)
3. [Tech stack and why](#3-tech-stack-and-why)
4. [Running it locally](#4-running-it-locally)
5. [Docker setup explained](#5-docker-setup-explained)
6. [Configuration (environment variables)](#6-configuration-environment-variables)
7. [API architecture: layers](#7-api-architecture-layers)
8. [Life of a request](#8-life-of-a-request)
9. [File-by-file: `apps/api`](#9-file-by-file-appsapi)
10. [Testing](#10-testing)
11. [Build phases and status](#11-build-phases-and-status)
12. [Conventions](#12-conventions)
13. [How to add a new endpoint (recipe)](#13-how-to-add-a-new-endpoint-recipe)
14. [Troubleshooting](#14-troubleshooting)
15. [Glossary](#15-glossary)
16. [Shared package: `packages/shared`](#16-shared-package-packagesshared)
17. [Continuous Integration (CI)](#17-continuous-integration-ci)

---

## 1. The big picture

Sewa Track is a citizen-service request tracker for ward recommendation letters (वडा सिफारिस).
Citizens submit and track requests; ward officers move them through a strict, audited workflow;
admins see where requests are overdue on a national map.

```
Browser ──▶ Next.js web (apps/web) ──/api/*──▶ Express API (apps/api) ──▶ PostgreSQL
                                                       │
                                                       └──▶ mock National ID service (apps/nid-mock)
```

It is a **monorepo**: frontend, backend and shared code live in one Git repository and are
managed together by **pnpm workspaces**.

---

## 2. Repository map

What exists today (✅) and what is planned (🔜):

```
sewa-track/
├─ apps/
│  ├─ api/                      ✅ Express + TypeScript REST API
│  │  ├─ db/
│  │  │  ├─ init/               ✅ SQL run once by Docker on first start (creates test DB)
│  │  │  └─ migrations/         ✅ versioned schema changes: 001_init.sql, ... (see database.md)
│  │  ├─ src/                   ✅ application code (see §9)
│  │  ├─ test/                  ✅ integration tests (real app + real test DB)
│  │  ├─ package.json           ✅ API dependencies and scripts
│  │  ├─ tsconfig.json          ✅ extends the root TypeScript config
│  │  └─ vitest.config.ts       ✅ test runner config (points tests at the test DB)
│  ├─ web/                      🔜 Next.js frontend
│  └─ nid-mock/                 🔜 tiny mock "existing government ID service"
├─ packages/
│  └─ shared/                   ✅ enums, Zod schemas, error types used by both api and web
├─ .github/workflows/ci.yml     ✅ CI: type-check → test (real Postgres) → build
├─ docs/
│  ├─ PRD.md                    ✅ requirements (source of truth for scope)
│  ├─ codebase-guide.md         ✅ this file
│  ├─ database.md               ✅ tables, constraints, migrations, SQL explained
│  └─ decisions/                🔜 ADRs (why we chose X over Y)
├─ docker-compose.yml           ✅ local Postgres 16
├─ package.json                 ✅ root scripts that run across all packages
├─ pnpm-workspace.yaml          ✅ tells pnpm which folders are packages
├─ pnpm-lock.yaml               ✅ exact installed versions (always commit this)
├─ tsconfig.base.json           ✅ shared strict TypeScript rules
├─ .env.example                 ✅ template for local env vars (safe to commit)
├─ .nvmrc                       ✅ Node version (22)
└─ .gitignore                   ✅ what never goes to Git (.env, node_modules, editor files…)
```

**Rule of thumb for where code goes:**

| If the code… | It goes in |
|---|---|
| is a business rule with no I/O (e.g. "can SUBMITTED → APPROVED?") | `apps/api/src/domain/` |
| runs SQL | `apps/api/src/repositories/` |
| reads the HTTP request / builds the response | `apps/api/src/controllers/` |
| is needed by both API and web (types, enums, validation schemas) | `packages/shared/` |

---

## 3. Tech stack and why

| Piece | Choice | Why |
|---|---|---|
| Runtime | Node.js 22 LTS | Current long-term-support release; Node 20 is end-of-life |
| Language | TypeScript (strict) | Catches mistakes at compile time; types document the code |
| Package manager | pnpm workspaces | Fast, disk-efficient, first-class monorepo support |
| API framework | Express 5 | Simple and widely known; v5 forwards async errors automatically |
| Validation | Zod | One schema gives both runtime checks and TypeScript types |
| Database | PostgreSQL 16 | Reliable relational DB with strong SQL features (CTEs, `FILTER`, partial indexes) |
| DB access | `pg` (node-postgres), **hand-written SQL, no ORM** | Every query is visible, explainable and tunable with `EXPLAIN ANALYZE` |
| Logging | pino | Fast structured JSON logs with redaction of sensitive fields |
| Security headers | helmet | Sensible HTTP security headers in one line |
| Tests | Vitest + Supertest | Fast test runner; Supertest sends HTTP requests to the app in memory |
| Local infra | Docker Compose | Same Postgres for everyone with one command |

**Why no ORM?** An ORM (like Prisma) writes SQL for you. Here, SQL is written by hand on purpose:
the important parts of this system (filtered queues, optimistic locking, map statistics) are
best expressed and optimised directly in SQL. All values are passed as parameters (`$1`, `$2`),
never glued into the SQL string, which prevents SQL injection.

---

## 4. Running it locally

Prerequisites: Node 22, pnpm 10, Docker.

```bash
pnpm install                      # install all workspace dependencies
cp .env.example .env              # local config (never commit .env)
docker compose up -d db           # start Postgres
pnpm --filter @sewa/api dev       # start the API with auto-reload
curl http://localhost:4000/api/v1/health
```

Root scripts (run from the repo root):

| Command | What it does |
|---|---|
| `pnpm dev` | Build shared once, then run every package's `dev` script in parallel (shared rebuilds on change) |
| `pnpm test` | Build shared, then run tests in every package |
| `pnpm typecheck` | Build shared, then type-check every package without emitting JS |
| `pnpm build` | Compile every package (pnpm builds `shared` first because the API depends on it) |
| `pnpm --filter @sewa/api <script>` | Run a script in just one package |

---

## 5. Docker setup explained

### Two ways to run the system

**Mode A, daily development (current):** only the database runs in Docker; apps run directly on Node.
Saving a file reloads the API in about a second.

```
Docker:  [ db ]
Laptop:  api (tsx watch)   web (next dev, later)   nid-mock (later)
```

**Mode B, whole system in Docker (planned for the deploy phase):** each app gets its own image
and Compose runs all of them on one private network.

```
web :3000 ──▶ api :4000 ──▶ db :5432
                  └──────▶ nid-mock :5000
```

### `docker-compose.yml`, line by line

```yaml
services:
  db:                               # service name = hostname for other containers ("db")
    image: postgres:16-alpine       # pinned major version; Alpine = small image
    environment:                    # read by the image on FIRST start only
      POSTGRES_USER: sewa
      POSTGRES_PASSWORD: sewa_dev_password    # local demo password, not a secret
      POSTGRES_DB: sewa_track
    ports:
      - "5432:5432"                 # laptop port : container port
    volumes:
      - db_data:/var/lib/postgresql/data      # data survives container restarts/removal
      - ./apps/api/db/init:/docker-entrypoint-initdb.d:ro   # *.sql here runs once on an empty volume
    healthcheck:                    # "started" ≠ "ready"; this asks Postgres if it accepts connections
      test: ["CMD-SHELL", "pg_isready -U sewa -d sewa_track"]
```

Key facts:

- **Two databases:** `sewa_track` (development) and `sewa_track_test` (tests only, created by
  `apps/api/db/init/01-create-test-db.sql`). Tests can wipe their DB without touching dev data.
- **Init scripts run only when the volume is empty.** After changing them, recreate the volume
  with `docker compose down -v` (this deletes local data).
- **Inside Docker, `localhost` means the container itself.** When the API runs in a container,
  it must connect to host `db`, not `localhost`.

### Everyday commands

```bash
docker compose up -d db          # start in the background
docker compose ps                # status + health
docker compose logs -f db        # follow logs
docker compose exec db psql -U sewa -d sewa_track    # SQL shell
docker compose stop              # stop, keep data
docker compose down              # remove containers, keep data volume
docker compose down -v           # remove containers AND data (init scripts run again)
```

---

## 6. Configuration (environment variables)

All variables are validated once at startup by `apps/api/src/config/env.ts`.
If one is missing or invalid, the API **exits immediately** and prints the variable *names*
(never values, which may be secrets).

| Variable | Example | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `PORT` | `4000` | HTTP port of the API |
| `DATABASE_URL` | `postgres://sewa:…@localhost:5432/sewa_track` | Main database connection |
| `TEST_DATABASE_URL` | `…/sewa_track_test` | Used by the test runner instead of `DATABASE_URL` |
| `LOG_LEVEL` | `info` | pino level; tests use `silent` |
| `APP_VERSION` | `0.0.1` | Reported by `/health` |
| `GIT_COMMIT` | `local` | Reported by `/health` so you can tell which build is deployed |

`.env` is loaded by Node's built-in `--env-file-if-exists` flag (dev script) and
`process.loadEnvFile` (Vitest config), so no `dotenv` package is needed.

---

## 7. API architecture: layers

```
routes/        → which URL + method goes to which controller. Wiring only.
controllers/   → read the request, validate with Zod, call a service, send the response.
services/      → the use case ("change status"): business rules + owns DB transactions.
domain/        → pure functions with the core rules. No database, no Express. Easy to unit-test.
repositories/  → the ONLY place that runs SQL.
integrations/  → calls to outside systems (mock National ID, notifier).
middleware/    → code that runs on every request (request id, auth, errors).
```

Dependencies point **one way only**:

```
routes → controllers → services → repositories → Postgres
                           └────→ domain (pure)
```

**Why layers?** Each layer has one job, so it is easy to find code, test parts in isolation and
change one part (e.g. a SQL query) without touching others. A simple endpoint with no business
logic (like `/health`) may skip the service layer.

---

## 8. Life of a request

Example: `GET /api/v1/health`

```
1. helmet()            adds security headers, removes "X-Powered-By: Express"
2. requestId           req.id = random UUID; response header X-Request-Id
3. express.json()      parses a JSON body (max 100 KB); broken JSON → 400
4. /api/v1 router      → healthRouter matches GET /health
5. getHealth           controller calls pingDatabase()
6. pingDatabase        repository runs SELECT 1 on the pool
7. response            200 {status:"ok", db:"up", version, commit}  or  503 {status:"degraded", db:"down"}

If no route matches  → notFound → errorHandler → 404 standard error
If anything throws   → errorHandler → standard error (500 for unexpected bugs)
```

### The standard error shape

Every error from the API looks like this:

```json
{
  "error": { "code": "NOT_FOUND", "message": "Route GET /api/v1/x not found", "details": {} },
  "requestId": "7ae71b02-ffb6-420b-aa95-a52e0ae46f40"
}
```

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Bad input (Zod failure or broken JSON) |
| `UNAUTHENTICATED` | 401 | Not logged in |
| `FORBIDDEN` | 403 | Logged in but not allowed (e.g. another ward) |
| `NOT_FOUND` | 404 | Unknown route or record |
| `CONFLICT` | 409 | Stale `version` (someone else updated first) |
| `INVALID_TRANSITION` | 422 | Status change not allowed by the workflow |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL` | 500 | Unexpected bug (details only in logs, never in the response) |
| `UPSTREAM_UNAVAILABLE` | 503 | An outside service failed |

The `requestId` lets you find the exact log lines for a failed request.

---

## 9. File-by-file: `apps/api`

| File | What it does | Key idea |
|---|---|---|
| `src/server.ts` | Entry point. Checks the DB, opens the port, handles shutdown. | Refuses to start without a DB. On SIGTERM/SIGINT: stop new connections → finish in-flight requests → close DB pool. 10 s safety timeout. |
| `src/app.ts` | `createApp()` builds the Express app and registers middleware and routers. | Does **not** listen on a port, so tests can use it in memory. Middleware order matters. |
| `src/config/env.ts` | Validates `process.env` with Zod; exports typed `env`. | Fail fast on bad config. `z.coerce.number()` turns `"4000"` into `4000`. |
| `src/logger.ts` | One pino JSON logger. | `redact` hides `password`, `token`, `applicant`, cookies and auth headers. |
| `src/db/migrate.ts` | `runMigrations(url)`: applies pending `db/migrations/*.sql`. | One transaction per file, checksum check, advisory lock. See [`database.md`](./database.md#3-migrations). |
| `src/db/migrate.cli.ts` | `pnpm db:migrate` entry point. | Separate file so tests can import the runner without running it. |
| `src/db/pool.ts` | Shared `pg.Pool` (max 10 connections) + `closePool()`. | Reusing connections is much faster than one new connection per request. Idle-connection errors are logged, not fatal. |
| `src/errors.ts` | `ERROR_STATUS` map and `AppError` class. | Codes come from `@sewa/shared`; `satisfies Record<ErrorCode, number>` fails the build if a code has no HTTP status. Throw `new AppError('NOT_FOUND', '…')` anywhere. |
| `src/types/express.d.ts` | Adds `req.id: string` to Express' `Request` type. | TypeScript "declaration merging". |
| `src/middleware/requestId.ts` | Sets `req.id` and the `X-Request-Id` header. | Always generated server-side; client ids are not trusted. |
| `src/middleware/errorHandler.ts` | `notFound` (404) and `errorHandler`. | Four-argument function = Express error handler. Handles `AppError`, `ZodError`, broken JSON, then everything else as 500. |
| `src/repositories/health.repository.ts` | `pingDatabase()` runs `SELECT 1`. | Repositories are the only layer that touches SQL. |
| `src/controllers/health.controller.ts` | `getHealth` returns 200 or 503. | Lets hosting platforms and smoke tests check the API and DB. |
| `src/routes/health.routes.ts` | `GET /health` → `getHealth`. | Routes contain no logic. |
| `test/health.test.ts` | Integration tests for health and the error format. | Real app + real test DB. |
| `test/schema.test.ts` | Tests that the database rejects bad data. | Each test in a rolled-back transaction. |
| `test/globalSetup.ts` | Runs migrations on the test DB once before all tests. | Tests always see the real schema. |
| `vitest.config.ts` | Test config. | Forces `DATABASE_URL` to the **test** database, runs `globalSetup`, runs test files one at a time (shared DB), silences logs. |
| `db/init/01-create-test-db.sql` | Creates `sewa_track_test`. | Run by Docker once, on an empty volume. |
| `db/migrations/001_init.sql` | The whole initial schema. | Constraints + append-only trigger. Never edited after merge. |

---

## 10. Testing

| Kind | Tool | What it proves | Where |
|---|---|---|---|
| Schema | Vitest + `pg` | The database itself rejects bad data | `apps/api/test/schema.test.ts` |
| Unit | Vitest | Pure rules (transitions, overdue, tracking code) | `src/domain/*.test.ts` (🔜) |
| Integration | Vitest + Supertest + real Postgres | Endpoints work end to end with SQL | `apps/api/test/*.test.ts` |
| Contract | Vitest | NID client still matches the mock's API | 🔜 |

Integration tests do **not** mock the database: mocks can hide real SQL bugs.
They use the separate `sewa_track_test` database, so they can never damage development data.

```bash
pnpm test                          # all packages
pnpm --filter @sewa/api test       # API only
pnpm --filter @sewa/api exec vitest   # watch mode while coding
```

Current tests (`test/health.test.ts`): health returns 200 with DB up; every response has an
`X-Request-Id`; unknown route returns the standard 404 shape; broken JSON returns 400, not 500.

---

## 11. Build phases and status

| Phase | Content | Status |
|---|---|---|
| P0 | Repo hygiene: `.gitignore`, public PRD | ✅ |
| P1 | Monorepo skeleton, Docker Postgres, API `/health`, shared package, CI | ✅ |
| P2 | SQL migrations + runner ✅, small demo seed (locations, service types, demo users) 🔜 | 🟡 |
| P3 | Domain rules: transitions, overdue, tracking code + unit tests | 🔜 |
| P4 | Read APIs (catalog, locations) + auth | 🔜 |
| P5 | Requests: submit, track, queue, detail, transitions, fee paid | 🔜 |
| P6 | Stats: map endpoint, palika report | 🔜 |
| P7 | Web frontend | 🔜 |
| P8 | Large seed + performance doc, Dockerfiles, deploy, README | 🔜 |
| P9 | NID mock + contract test, Swagger, ADRs, full Nepali UI | 🔜 |

---

## 12. Conventions

- **ES modules with `.js` in imports.** Source files are `.ts`, but imports end in `.js`
  (`import { env } from './config/env.js'`). With `"module": "NodeNext"`, TypeScript keeps the
  import path as written, and at runtime Node loads the compiled `.js` file.
- **File names:** `<thing>.<layer>.ts`, e.g. `health.controller.ts`, `health.repository.ts`.
- **Explicit types on exports** (`createApp(): Express`): clearer, and required by the strict config.
- **Comments explain *why*, not *what*.** Business rules, transactions and locking always get a comment.
- **Money** is an integer number of NPR. **Timestamps** are stored in UTC.
- **SQL** always uses placeholders (`$1`, `$2`). Never build SQL by joining strings with user input.
- **Commits:** Conventional Commits, e.g. `feat(api): add health endpoint`, one logical change each.
  Branches: `feat/<issue>-<slug>`, `fix/<issue>-<slug>`.
- **Never commit:** `.env`, secrets, editor settings, personal or tool-specific files (see `.gitignore`).

---

## 13. How to add a new endpoint (recipe)

Example: `GET /api/v1/service-types`.

1. **Shared schema** (if the web needs the type): add it to `packages/shared`.
2. **Repository:** `src/repositories/serviceType.repository.ts` with a function that runs the SQL.
3. **Service** (if there are business rules or a transaction): `src/services/serviceType.service.ts`.
4. **Controller:** `src/controllers/serviceType.controller.ts`, which validates input with Zod
   (`schema.parse(req.query)`; a failure becomes a 400 automatically) and sends JSON.
5. **Route:** `src/routes/serviceType.routes.ts` wires `GET /service-types` to the controller.
6. **Register** the router in `src/app.ts` (`api.use(serviceTypeRouter)`).
7. **Test:** `test/serviceTypes.test.ts` with Supertest against the test DB.
8. **Docs:** update this guide and the API docs in the same change.
9. Run `pnpm typecheck && pnpm test` before committing.

---

## 14. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Cannot reach the database` on start | Postgres not running | `docker compose up -d db` |
| `Invalid or missing environment variables: DATABASE_URL` | No `.env` | `cp .env.example .env` |
| `port is already allocated` (5432) | Another Postgres on your machine | Stop it, or change the left side of `"5432:5432"` and `DATABASE_URL` |
| `EADDRINUSE :4000` | API already running in another terminal | Stop it or set `PORT=4001` |
| `Cannot find module '@sewa/shared'` | Shared package not built yet | `pnpm build:shared` (root `dev`/`test`/`typecheck` do this for you) |
| Tests fail with `database "sewa_track_test" does not exist` | Volume was created before the init script existed | `docker compose down -v && docker compose up -d db` (deletes local data) |
| `/health` returns 503 | API runs, DB is down | Start the DB; check `docker compose logs db` |

---

## 15. Glossary

| Term | Meaning |
|---|---|
| Monorepo | One Git repo containing several packages (api, web, shared) |
| Workspace | A package inside the monorepo that pnpm manages |
| Middleware | A function that runs for every request before (or after) the route handler |
| Connection pool | A set of open DB connections shared between requests |
| Migration | A versioned SQL file that changes the schema; applied in order, never edited after merge |
| Integration test | Tests several layers together (HTTP → SQL) against a real database |
| Fail fast | Crash at startup on bad config instead of failing later at random |
| Graceful shutdown | Finish running requests and close connections before the process exits |
| Optimistic locking | Detect concurrent edits with a `version` column; the loser gets 409 |
| Request id | A unique id per request, used to connect an error report to log lines |
| Ward sifaris (वडा सिफारिस) | A recommendation/verification letter issued by a ward office |

---

## 16. Shared package: `packages/shared`

Code that **both** the API and the web app need, so it is written once and can't drift apart.

```
packages/shared/
├─ src/
│  ├─ enums.ts     REQUEST_STATUSES, TERMINAL_STATUSES, SERVICE_TYPE_CODES, ROLES, LOCAL_LEVEL_TYPES, EVENT_ACTIONS
│  ├─ errors.ts    ERROR_CODES + ApiErrorBody (the error response shape)
│  └─ index.ts     public entry: what other packages may import
├─ dist/           compiled JS + .d.ts types (generated, git-ignored)
├─ package.json    "exports" points to dist/
└─ tsconfig.json
```

**One pattern for every list of values:**

```ts
export const ROLES = ['CITIZEN', 'WARD_OFFICER', 'PALIKA_ADMIN', 'SYSTEM_ADMIN'] as const; // 1. the values
export type Role = (typeof ROLES)[number];                                              // 2. the TS type
export const roleSchema = z.enum(ROLES);                                               // 3. runtime validation
```

Add a value in one place → the type, the validation and the UI all follow.
`as const` keeps the exact strings as types (`'CITIZEN' | …`) instead of widening to `string`.

**How other packages find it (4 pieces):**

1. `pnpm-workspace.yaml` lists `apps/*` and `packages/*` as packages.
2. Each package has a name in its own `package.json` (`@sewa/api`, `@sewa/shared`, later `@sewa/web`).
3. `apps/api/package.json` has `"@sewa/shared": "workspace:*"`: "use the local package with this name,
   never download it from npm".
4. `pnpm install` creates a **symlink**: `apps/api/node_modules/@sewa/shared → ../../../../packages/shared`.

On `import { ROLES } from '@sewa/shared'`, Node follows the symlink, reads `"exports"` in
`packages/shared/package.json`, and loads `dist/index.js` (TypeScript reads `dist/index.d.ts`).
The web app (P7) will use the same mechanism: one source, two symlinks.

Each app keeps its **own** `package.json` and dependencies; the root `package.json` only has
scripts. There is **one** `pnpm-lock.yaml` for the whole repo. pnpm is strict: a package can
only import dependencies listed in its own `package.json`.

- Import with `import { ROLES } from '@sewa/shared'`.
- The package is **compiled to `dist/`** first, because in production the API runs as plain
  JavaScript (`node dist/server.js`) and Node cannot run `.ts` files from a dependency.
  Root scripts run `pnpm build:shared` before `dev`, `test` and `typecheck`.

---

## 17. Continuous Integration (CI)

File: `.github/workflows/ci.yml`. Runs on every pull request and every push to `main`.

```
checkout → install pnpm (version from package.json) → install Node (from .nvmrc)
→ pnpm install --frozen-lockfile → type-check → test (with a real Postgres 16) → build
```

| Setting | Why |
|---|---|
| `services: db` (postgres:16-alpine) | Integration tests need a real database; same version as local |
| health options on the service | Steps wait until Postgres is ready, not just started |
| `--frozen-lockfile` | Fails if `pnpm-lock.yaml` is out of date, so CI installs exactly what was tested |
| `concurrency … cancel-in-progress` | A new push cancels the older running check |
| `permissions: contents: read` | Least privilege: the workflow can only read the code |
| `cache: pnpm` | Reuses downloaded packages between runs (faster CI) |

**Workflow:** work on a branch → push → open a PR → CI must be green ✅ → merge into `main`.
