# Sewa Track — Product Requirements Document (PRD)

> Version 1.2 · 2026-10-21 · Owner: Darshan Bajgain
> v1.2: public version (personal schedule and role mapping removed). v1.1: added §2.1 existing systems; national delay map is the headline feature.
> Status: **Approved for development.** Anything not in this document is out of scope unless the owner adds it here first.

---

## 0. Read this first

- Sewa Track is a **demo / portfolio project**. It is **not** a government service and is **not affiliated** with any government body.
- All data is **fake** (generated). No real person's data is ever stored, collected, or scraped.
- Every line should be easy to read and explain. Prefer simple, readable code over clever code.

---

## 1. Summary

Sewa Track is an **open-source, national** citizen-service platform for Nepal's 753 local levels. Its headline feature is a **national service-delay map**: it shows where ward recommendation requests (वडा सिफारिस) are overdue against each service's promised time in the citizen charter, by district and palika. Behind the map is one shared data model, a strict audited workflow for ward officers, public tracking for citizens, and a clean integration with an existing ID service.

**One-line pitch:** "Online sifaris exists, but every palika uses a different vendor and the data isn't connected. Sewa Track is an open, national version: one data model for all 753 local levels, delay tracking against citizen charters on a national map, and clean integration with existing services, built with tests, audit logs and documentation the way a government software team would maintain it."

## 2. Problem

From public citizen charters (नागरिक बडापत्र) and common experience at ward offices:

1. **Repeat visits.** Citizens arrive with a missing document and must come back.
2. **No status visibility.** Citizens cannot see whether their file is waiting, in field verification, or lost.
3. **Family members abroad** need नाता / आय / मूल्याङ्कन letters quickly and depend on someone running to the office.
4. **No data for ward/palika leaders.** Paper registers cannot show how many requests, how long they take, or where delays are.
5. **Fragmentation.** Where online systems exist, each palika or ward signs up with a different vendor or builds its own. The data is not connected, so nobody can see service delivery across Nepal, and the government depends on many separate vendors.

## 2.1 Existing systems and how Sewa Track differs

Online sifaris **already exists** in parts of Nepal. Sewa Track does not claim to be the first; it claims to address what a fragmented setup lacks. (Checked 2026-10-20 from public websites; re-check before quoting.)

| System | What it does (public info) | Gap Sewa Track focuses on |
|---|---|---|
| **WadaConnect** (private company, Haitomns Groups, Birgunj) | Online sifaris applications, document attachment, status tracking, digitally signed letters; wards sign up individually | Vendor product, adopted ward by ward; no national analytics mentioned; closed source |
| **Kathmandu Metropolitan City** online system | Online applications in KMC wards, starting with citizenship recommendations | One city only |
| Other palika apps / vendor systems | Varies by palika | Different systems, no shared data model |
| Paper registers | Most common in many wards | No tracking, no data |

**Sewa Track's differentiators (lead with these, in this order):**
1. **National service-delay view.** Overdue tracking against each service's charter time, shown on a Nepal map from district down to palika. This is the headline feature.
2. **One data model for all 753 local levels.** Province → district → palika → ward, so data from every office is comparable.
3. **Open source, government-ownable.** No vendor lock-in; code can be reviewed. Fits the goal of the government building and maintaining its own software.
4. **Integration-ready.** Talks to an "existing service" (mock National ID) through a fixed contract, with timeout, retry, and a contract test.
5. **Production engineering practice.** Strict workflow, audit log in the same transaction, optimistic locking, tests, CI, performance write-up, ADRs and an incident write-up.

**Positioning rules:**
- Never say "first online sifaris system in Nepal" or criticize a named vendor. State facts only.
- Don't copy any existing system's UI, text, or branding.

**Short pitch:** "Online sifaris already exists through vendors like WadaConnect and city systems like KMC's, but each palika uses a different one and the data isn't connected. I built an open, national version focused on what that misses: one data model for all 753 local levels, delay tracking against citizen charters on a national map, and clean integration with existing services."

## 3. Goals and non-goals

### Goals (v1), in priority order
- G1. **National service-delay map (headline):** admins and the public see where requests are overdue against charter time, by district and palika (choropleth + heatmap).
- G2. Officers process requests through a **strict workflow**; every change is **audited**.
- G3. Officers can only act on **their own ward**.
- G4. Citizen can submit a request and track it without logging in (tracking code).
- G5. Citizen can see the exact required documents and fee before visiting.
- G6. Clean integration with an existing service (mock National ID) through a fixed contract.
- G7. The codebase shows production engineering practice end to end (see §15).

### Non-goals (v1) — do NOT build
- Online payment, digital signatures, issuing the final legal letter online (final letter is printed and stamped at the office).
- File/document upload.
- Real SMS/email sending (a stub that logs is enough).
- Real National ID integration (a **mock** service only).
- Mobile app.
- Any real government branding (see §12).

## 4. Users and roles

| Role | Who | Scope | Can do |
|---|---|---|---|
| `CITIZEN` | Applicant | Own requests | Submit, view own requests, resubmit when documents requested, cancel (early states only) |
| `WARD_OFFICER` | Ward staff | **One ward** (`wardId`) | View ward queue, change status, mark fee paid, add notes |
| `PALIKA_ADMIN` | Palika IT/admin | **One local level** (`localLevelId`), all its wards | Read all requests in palika, reassign officer, palika map and reports. **Cannot change status.** |
| `SYSTEM_ADMIN` | National view | All of Nepal | National map, reports, **user management** (create ward officers and palika admins, deactivate accounts; F14). **Cannot change status.** |
| Public (no login) | Anyone | — | Service catalog, track by code (limited fields), public aggregate stats map |

Rule: **authorization is checked on the server for every request** (never trust the UI). Officers acting outside their ward get `403 FORBIDDEN`.

**Accounts (changed 2026-11-01, ADR-003):** citizens **sign up themselves** (always as `CITIZEN`). Staff accounts are **created only by the system admin**; nobody can self-register as staff. Each role has its own portal: citizen `/citizen`, ward officer `/ward`, palika admin `/palika`, system admin `/admin`.

## 5. Service types (v1: exactly 5)

Fees and days below are **demo values**, labeled "Demo values — based on public citizen charters; may be outdated."

| Code | नेपाली | English | Fee (NPR, demo) | Service days (demo) | Field verification |
|---|---|---|---|---|---|
| `RELATIONSHIP` | नाता प्रमाणित | Relationship verification | 200 | 1 | No |
| `RESIDENCE` | बसोबास प्रमाणित | Residence verification | 100 | 1 | No |
| `LOW_INCOME` | आर्थिक अवस्था कमजोर सिफारिस | Low-income recommendation | 0 | 2 | Yes |
| `LAND_BOUNDARY` | चार किल्ला प्रमाणित | Land boundary (four-sides) verification | 500 | 3 | Yes |
| `DATE_OF_BIRTH` | जन्म मिति प्रमाणित | Date of birth verification | 100 | 1 | No |

Each type stores: `code`, `nameEn`, `nameNe`, `feeNpr`, `serviceDays`, `requiresFieldVerification`, `requiredDocuments` (list of `{nameEn, nameNe}`).

## 6. Request workflow (the core business rule)

### 6.1 Statuses
`SUBMITTED`, `UNDER_REVIEW`, `NEEDS_DOCUMENTS`, `FIELD_VERIFICATION`, `APPROVED`, `REJECTED`, `ISSUED`, `CANCELLED`

Terminal: `ISSUED`, `REJECTED`, `CANCELLED`.

### 6.2 Allowed transitions (anything else → `422 INVALID_TRANSITION`)

| From | To | Actor | Conditions |
|---|---|---|---|
| SUBMITTED | UNDER_REVIEW | Ward officer (own ward) | Sets `assignedOfficerId` if empty |
| SUBMITTED | CANCELLED | Citizen (owner) | — |
| UNDER_REVIEW | NEEDS_DOCUMENTS | Ward officer | `note` required |
| NEEDS_DOCUMENTS | UNDER_REVIEW | Citizen (owner) | `note` required (what was added) |
| NEEDS_DOCUMENTS | CANCELLED | Citizen (owner) | — |
| UNDER_REVIEW | FIELD_VERIFICATION | Ward officer | Only if service type `requiresFieldVerification` |
| FIELD_VERIFICATION | UNDER_REVIEW | Ward officer | `note` required; sets `fieldVerifiedAt` |
| UNDER_REVIEW | APPROVED | Ward officer | Fee paid if `feeNpr > 0`; `fieldVerifiedAt` set if type requires it |
| UNDER_REVIEW | REJECTED | Ward officer | `reason` required |
| FIELD_VERIFICATION | REJECTED | Ward officer | `reason` required |
| APPROVED | ISSUED | Ward officer | Sets `closedAt` (letter printed/stamped at office) |

Also: `REJECTED` and `CANCELLED` set `closedAt`.

### 6.3 Rules
- R1. The transition table lives in **one pure function** (`domain/transitions.ts`) with no DB access, fully unit-tested.
- R2. Every status change and every "mark fee paid" writes an **audit event in the same DB transaction**. If the audit insert fails, the status change rolls back.
- R3. **Optimistic locking:** status changes send the current `version`. Update uses `WHERE id = $1 AND version = $2`, then increments `version`. 0 rows updated → `409 CONFLICT`. (Prevents two officers changing the same request at once.)
- R4. **Overdue:** a request is overdue if not terminal and `now > submittedAt + serviceDays` (calendar days in v1; working days is a documented next step).
- R5. Audit events are **append-only**. No update/delete endpoint exists.

## 7. Functional requirements and acceptance criteria

### F1. Service catalog (public)
- List the 5 service types with documents, fee and days, in Nepali and English.
- **AC:** `GET /api/v1/service-types` returns all 5; the UI shows a checklist per type.

### F2. Location hierarchy
- Province (7) → District (77) → Local level (753) → Ward. Seeded once.
- Each local level has `type` (`METRO`, `SUB_METRO`, `MUNICIPALITY`, `RURAL_MUNICIPALITY`) and a centroid `lat/lng`, computed from a verified boundary file (official 2020 map). Until that file is chosen, coordinates are empty (`NULL`), never made up.
- Wards have **no coordinates**: the map works at district and palika level only.
- Source of names, types and ward counts: [local-states-nepal](https://github.com/sagautam5/local-states-nepal) (MIT), see `apps/api/db/seed-data/README.md`.
- **AC:** cascading dropdowns (province → district → palika → ward) work; counts are 7 / 77 / 753.

### F3. Authentication and citizen sign-up
- **Email** + password login for every role (scrypt hash). JWT in an **httpOnly, Secure, SameSite=Lax cookie**, 8h expiry.
- **Citizen sign-up** (`/register`): name, email, password (≥ 8). Logged in straight away. Role is always `CITIZEN`.
- **Demo rule:** new accounts must use an `@example.com` email (reserved for examples, RFC 2606), so the public demo never stores a real address (§12.3).
- **Demo mode** on the login page: a separate, collapsed panel listing one fake account per role; choosing one fills the normal form.
- Deactivated accounts can't log in (403) and their sessions stop working immediately.
- **AC:** wrong password or unknown email → same 401; sign-up with a taken email → 409; non-demo email → 400; protected routes without a cookie → 401; sign-up and login rate limited (5/min).

### F4. Submit request (citizen)
- Fields: service type, ward (via cascading selects), purpose (text, 10–500 chars), applicant details (demo: name, demo NID like `DEMO-1234567`), consent checkbox ("I understand this is a demo and I am not entering real information").
- Server stores denormalized `wardId`, `localLevelId`, `districtId`, `provinceId` (copied at insert, never changed — see ADR-001).
- Generates a **non-sequential tracking code**: `ST-` + 10 random Crockford Base32 chars.
- Triggers mock National ID verification (F9). Submission **does not fail** if the mock is down; `identityCheck = PENDING`.
- **AC:** valid input → 201 with tracking code; invalid → 400 `VALIDATION_ERROR` with field details; audit event `CREATED` exists.

### F5. Track request (public)
- `GET /api/v1/track/:trackingCode` returns only: service type, ward/palika name, status, submitted date, last updated, overdue flag, timeline of status changes (status + date, **no notes, no names**).
- Rate limit: 10 requests/min/IP → 429 `RATE_LIMITED`.
- **AC:** unknown code → 404; response never contains applicant details.

### F6. Officer queue and request detail
- Queue: requests in the officer's ward; filter by status, service type, overdue; sort by oldest first; paginated (20/page).
- Detail: all fields, audit timeline (with notes), allowed next actions only (computed by the transition function).
- Actions: change status (with note/reason where required), mark fee paid.
- Dates shown in **BS and AD**.
- **AC:** officer of ward A requesting a ward B request → 403; the UI only shows valid actions; stale version → 409 with a clear message "This request was updated by someone else. Reload."

### F7. Palika admin
- Read-only list across all wards of the palika; reassign `assignedOfficerId` (audited).
- Palika report: counts by status and type, average days to close, overdue count per ward.
- **AC:** palika admin cannot call status-change endpoints (403).

### F8. National service-delay map (HEADLINE feature)
- This is the first thing shown in the README and the demo video. Default metric is **`overdue`** (delay against charter time), not raw volume.
- Also show an **"on-time rate"** per area: requests closed within `serviceDays` ÷ all closed requests, in the side panel and public stats.
- **Admin map** (`/admin/map`, system admin = Nepal, palika admin = own palika):
  - Choropleth by **district** (default) with drill-down to **palika** on click.
  - Metric toggle: `overdue` count (default), `onTimeRate`, `pending` count, `avgDaysToClose`.
  - **Heatmap layer** (Leaflet.heat): one point per palika centroid, weighted by request count.
  - Filters: service type, status, date range. Map refetches on change.
  - Side panel on click: counts by type and status for that area.
  - Legend, loading state, empty state.
- **Public stats map** (`/stats`): same choropleth, **aggregates only**, no drill-down to individual requests.
- **Home page** (`/`) leads with the public delay map and 3 national numbers (open requests, overdue, on-time rate), then links to "Apply" and "Track".
- Backend: `GET /api/v1/stats/map?level=district|local_level&metric=overdue|onTimeRate|pending|avgDaysToClose...&serviceType=&status=&from=&to=&parentId=` returns `[{areaId, value}]`, computed with **one SQL GROUP BY** (raw SQL, parameterized).
- **Boundaries must match Nepal's official 2020 map, including Lipulekh, Kalapani and Limpiyadhura.** Verify the GeoJSON before use. Simplify with `mapshaper` and store under `apps/web/public/geo/`. Credit source and license in the README.
- **AC:** map loads district view < 2 s on a normal connection; toggling metric updates colors; p95 of the stats endpoint < 200 ms locally on 100k rows (with index, see F11).

### F9. Integration: mock National ID service
- Separate service `apps/nid-mock` (tiny Express app) simulating an "existing government service":
  - `POST /verify {nid, name}` → `{match: boolean}`; random latency 100–1500 ms; ~10% return 503.
- API client in `apps/api/src/integrations/nidClient.ts`: **2 s timeout, 2 retries with exponential backoff (200 ms, 400 ms)**, maps failures to `UPSTREAM_UNAVAILABLE`.
- Result stored in `identity_checks` (`status: PENDING|MATCH|NO_MATCH|FAILED`, `attempts`, `responseMs`).
- **Contract test:** a test asserts the client's request/response shape against a stub, so a change in the mock's API breaks the build (maintaining compatibility).
- **AC:** with the mock stopped, submission still succeeds and identity check is `FAILED` after retries; officer sees the result on the detail page.

### F10. Notifications (stub)
- `Notifier` interface with `ConsoleNotifier` that logs "status changed" messages. No real SMS.
- **AC:** each status change calls the notifier once (unit-tested with a fake).

### F11. Performance: seed and EXPLAIN
- `pnpm seed:large` creates **100,000** fake requests spread across districts with realistic skew (more in Kathmandu valley, Jhapa, Morang, etc.) and random statuses/dates over 12 months.
- `docs/performance.md`: the map stats query and the officer queue query, `EXPLAIN ANALYZE` **before and after** the index, timings, and a plain-words explanation.
- Planned indexes: `(district_id, status, submitted_at)`, `(ward_id, status, submitted_at)`, unique `tracking_code`.
- **AC:** document shows a measurable improvement with real numbers from the owner's machine.

### F12. Bilingual UI
- Nepali / English toggle; dictionary files `messages/en.json`, `messages/ne.json`. All user-facing labels go through the dictionary.
- Nepali digits optional (next step).

### F14. User management (system admin)
- `/admin/users`: list (role filter, search by name/email, 20 per page), **create** a ward officer (choose palika → ward) or palika admin (choose palika), **deactivate / reactivate**.
- Only `WARD_OFFICER` and `PALIKA_ADMIN` can be created; system admin accounts can't be deactivated. Accounts are never deleted (requests and audit rows point at them). `created_by` records which admin created each staff account.
- **AC:** non-system-admin → 403; role without its scope (officer without ward) → 400; deactivated officer's existing session → 401.

### F13. Demo safety
- Fixed banner on every page (both languages): **"Demo / portfolio project. Not affiliated with any government body. Do not enter real information."**
- `pnpm demo:reset` re-seeds the database (can be run nightly by the host's cron or a scheduled GitHub Action).

## 8. Data model

```
provinces(id, name_en, name_ne)
districts(id, province_id → provinces, name_en, name_ne)
local_levels(id, district_id → districts, name_en, name_ne, type, lat, lng)  -- lat/lng nullable until verified
wards(id, local_level_id → local_levels, number)                -- no coordinates

users(id uuid, role, name, phone unique, password_hash,
      ward_id nullable → wards, local_level_id nullable → local_levels, created_at)

service_types(code pk, name_en, name_ne, fee_npr int, service_days int,
              requires_field_verification bool, required_documents jsonb)

service_requests(
  id uuid pk, tracking_code unique, citizen_id → users, service_type_code → service_types,
  ward_id, local_level_id, district_id, province_id,        -- denormalized, immutable (ADR-001)
  status, purpose, applicant jsonb,                         -- demo data only
  assigned_officer_id nullable → users,
  fee_paid_at nullable, field_verified_at nullable,
  version int default 0,                                    -- optimistic locking (ADR-002)
  submitted_at, updated_at, closed_at nullable)

request_events(                                             -- append-only audit log
  id bigserial, request_id → service_requests, actor_id nullable → users,
  action,  -- CREATED | STATUS_CHANGED | FEE_PAID | REASSIGNED | IDENTITY_CHECKED
  from_status nullable, to_status nullable, note nullable, created_at)

identity_checks(id, request_id → service_requests, status, attempts, response_ms nullable, created_at)
```

Money is stored as **integer NPR**. Timestamps are stored in UTC; displayed in Asia/Kathmandu with BS conversion.

## 9. API (v1)

Base: `/api/v1`. JSON only. Swagger UI at `/docs` (generated from Zod schemas or a hand-written OpenAPI file).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | — | `{status, db, version, commit}` |
| GET | `/service-types` | — | Catalog |
| GET | `/locations/provinces` · `/districts?provinceId=` · `/local-levels?districtId=` · `/wards?localLevelId=` | — | Hierarchy |
| POST | `/auth/login` · `/auth/register` · `/auth/logout` · GET `/auth/me` | — / any | Auth, citizen sign-up |
| GET · POST | `/admin/users` · PATCH `/admin/users/:id` | System admin | User management (F14) |
| POST | `/requests` | Citizen | Submit |
| GET | `/requests/mine` | Citizen | Own requests |
| GET | `/requests` | Officer / Palika / System | Queue (scoped by role) |
| GET | `/requests/:id` | Owner / scoped staff | Detail + events |
| POST | `/requests/:id/transitions` | Officer / Citizen | `{toStatus, version, note?, reason?}` |
| POST | `/requests/:id/fee-paid` | Officer | `{version}` |
| POST | `/requests/:id/reassign` | Palika admin | `{officerId, version}` |
| GET | `/track/:trackingCode` | — | Public tracking (limited fields, rate limited) |
| GET | `/stats/map` | Public (aggregate) / admin | Map data |
| GET | `/stats/summary` | Palika / System | Report counts |

### Error format (every error)
```json
{ "error": { "code": "INVALID_TRANSITION", "message": "Cannot move from SUBMITTED to APPROVED", "details": {} }, "requestId": "..." }
```

| Code | HTTP |
|---|---|
| VALIDATION_ERROR | 400 |
| UNAUTHENTICATED | 401 |
| FORBIDDEN | 403 |
| NOT_FOUND | 404 |
| CONFLICT | 409 |
| INVALID_TRANSITION | 422 |
| RATE_LIMITED | 429 |
| UPSTREAM_UNAVAILABLE | 503 |
| INTERNAL | 500 (no stack traces in responses) |

## 10. Non-functional requirements

- **Security:** Zod validation on every input; parameterized SQL only (no string-built SQL); `helmet`; CORS limited to the web origin; rate limits on login (5/min/IP) and track; bcrypt cost ≥ 10; secrets only via env (`.env.example` committed, `.env` never); no PII in logs.
- **Logging:** `pino` structured logs with a `requestId` per request (also returned in error responses).
- **Performance:** stats endpoint p95 < 200 ms on 100k rows locally; queue endpoint p95 < 150 ms.
- **Accessibility:** labeled inputs, keyboard navigable, visible focus, sufficient contrast; map has a table fallback ("View as table").
- **Responsive:** works at 360 px width.
- **Reliability:** API starts only if DB is reachable; graceful shutdown on SIGTERM.

## 11. Architecture and stack

```
apps/
  api/        Express + TypeScript, Zod, pg (hand-written parameterized SQL, .sql migrations), pino, Vitest + Supertest
  web/        Next.js (App Router) + TypeScript, Tailwind, react-leaflet + leaflet.heat, TanStack Query
  nid-mock/   Tiny Express app (mock National ID service)
packages/
  shared/     Zod schemas and types shared by api and web (status enum, DTOs)
docs/         PRD, architecture, performance, ADRs, incidents
```

- Monorepo with **pnpm workspaces**. Node 22 LTS. PostgreSQL 16.
- `docker-compose.yml`: postgres, api, nid-mock, web (for local).
- API layers: `routes → controllers → services → repositories`, with `domain/` (pure business rules, no I/O).
- **Deployment (proposed, to be confirmed):** Postgres on Neon (free), API + nid-mock on Render (or Railway), web on Vercel.

## 12. Legal, privacy and branding rules (mandatory)

Not legal advice; these are the project's safety rules.

1. **No government branding.** No national emblem (coat of arms), no national flag, no palika logos, no "नेपाल सरकार / Government of Nepal" header, no `.gov.np`-like domain. Nepal's National Penal Code s.151 restricts improper use of the anthem, flag and coat of arms.
2. **Demo banner** on every page (F13). README starts with a disclaimer.
3. **Fake data only.** Faker-generated names; IDs prefixed `DEMO-`. Never real citizenship numbers, never real names, never scraped personal data. (Nepal's Individual Privacy Act 2075 requires consent and authorization to collect personal information.)
4. **No real officials.** Seeded staff are "Ward Officer (Demo)" etc.
5. **Live demo does not collect real data:** consent checkbox, demo logins, periodic reset.
6. **Official map:** boundaries include Lipulekh, Kalapani and Limpiyadhura (2020 official map). Credit the GeoJSON source and follow its license.
7. **Charter content** is public information; label fees/days as demo values that may be outdated.
8. **Open source:** MIT license; run `gitleaks` on the full history before making the repo public; rotate anything found.
9. **No implied endorsement:** the README does not claim the project was built for, or approved by, any government body.
10. **Real use by a ward** is a separate future project requiring a written agreement with the palika, real consent text, secure hosting, and legal review. The demo must never quietly become real use.

## 13. Testing strategy

| Level | Tool | What |
|---|---|---|
| Unit | Vitest | Transition table (every allowed + a sample of forbidden), overdue calc, tracking code format/uniqueness, NID client retry/timeout (fake timers), notifier called once |
| Integration | Vitest + Supertest + real Postgres (test DB, reset per file) | Submit, track (no PII leak), ward scoping 403, invalid transition 422, **concurrent update → one 200 + one 409**, audit row written in same transaction, stats endpoint shape |
| Contract | Vitest | NID client ↔ mock request/response shape |
| Smoke (CI after deploy) | curl or a small script | `/health` 200, track a seeded code 200 |
| E2E (stretch) | Playwright | One happy path: submit → officer approves → issued |

Target: domain folder ≥ 90% line coverage. Tests must run with one command: `pnpm test`.

## 14. Engineering process (this is part of the product)

- **GitHub Issues** for each feature (F1–F13), written as requirements with acceptance criteria and an estimate (S/M/L). Milestones M1–M3.
- Branches `feat/<issue>-<slug>`, `fix/...`. **Conventional commits.** PRs link issues and use the PR template (what, why, how tested, screenshots).
- CI (GitHub Actions): lint → typecheck → test (Postgres service container) → build. Merge blocked if CI fails. On `main`: deploy, then smoke test.
- Releases: tags `v0.1.0` (M2), `v0.2.0` (M3) with release notes; `CHANGELOG.md`.
- Docs: `README.md` (disclaimer, then the delay-map screenshot and the one-line pitch from §1, a short "Existing systems" paragraph from §2.1, demo link, quick start, architecture diagram), `docs/architecture.md` (Mermaid), `docs/codebase-guide.md` (how to read the code; life of a request), `docs/database.md` (tables, indexes, every SQL query explained), `docs/api.md`, `docs/performance.md`, `docs/decisions/ADR-001-denormalized-location.md`, `ADR-002-optimistic-locking.md`, `ADR-003-mock-nid-integration.md`, `docs/incidents/001-concurrent-status-update.md` (blameless postmortem of the race condition: how found, reproduced in a test, fixed), `SECURITY.md`.

## 15. Engineering practice map

| Practice | Evidence in this repo |
|---|---|
| Implement features and APIs from approved requirements | This PRD → Issues with acceptance criteria → PRs; Swagger `/docs` |
| Optimize DB queries; validation and error handling | Raw SQL stats, indexes, `docs/performance.md`, Zod everywhere, standard error format |
| Unit and integration tests; code review; QA/security findings | §13 test suite, PR template, CI gate, `SECURITY.md`, rate limits |
| Investigate defects; reviewed fixes; compatibility with existing services | Incident 001 (409 optimistic locking), NID mock + contract test |
| Team estimates and release preparation | Issue estimates, milestones, tagged releases, changelog |
| Documentation, handover, deployment verification | README, ADRs, architecture doc, `/health`, post-deploy smoke test |
| Government-ownable software (no vendor lock-in) | Open source, one national data model (§2.1) |

## 16. Milestones

| Milestone | Must be done |
|---|---|
| **M0 Setup** | Repo, docs, workspaces, docker-compose Postgres, SQL migrations + migration runner |
| **M1 Backend** | F1–F6 API, F7 read endpoints, F8 stats endpoint, F10 stub, R1–R5, unit + integration tests green, CI running |
| **M2 Frontend + ship** | Web pages (home delay map, catalog, apply, track, login, officer queue/detail, admin map), F11 seed + performance doc, F13, Docker, deploy, README, short demo video → **tag v0.1.0** |
| **M3 Polish** | F9 NID mock + contract test, Swagger, ADRs, incident doc, full Nepali UI, palika drill-down → **tag v0.2.0** |

If time runs short, cut in this order: E2E test → palika reassign → BS dates → heatmap layer (keep choropleth) → drill-down to palika (keep district map) → Nepali translations beyond core labels. **Never cut:** the district delay map with the overdue metric, transition rules, audit-in-transaction, ward scoping, tests, demo banner, README.

## 17. Definition of done (whole project)

- [ ] Deployed demo link works; demo logins work; banner visible.
- [ ] `pnpm test` green locally and in CI.
- [ ] README explains purpose, disclaimer, architecture, setup in < 5 commands, and links docs.
- [ ] `docs/performance.md` has real before/after numbers.
- [ ] Map uses official 2020 boundaries, source credited.
- [ ] `gitleaks` clean; MIT license; repo public.
- [ ] Owner can explain how Sewa Track differs from existing systems (§2.1) in under 30 seconds.
- [ ] Owner can explain: overdue and on-time-rate calculation, transition function, transaction + audit, optimistic locking, ward scoping, map SQL and index, NID retries.

## 18. Open questions (decide before the related milestone)

1. Hosting: Render vs Railway for API (decide by M2).
2. GeoJSON source with official 2020 boundaries (find and verify at M0/M1).
3. BS date library: confirm an actively maintained npm package exists before adding it; otherwise use a small, tested conversion table for the demo date range.

## 19. Future (not v1)

Working-day SLA with holidays, SMS via a real gateway, document upload, Nepali digits, more service types, palika-configurable fees, offline-friendly officer UI, real pilot with a ward (legal steps in §12.10).
