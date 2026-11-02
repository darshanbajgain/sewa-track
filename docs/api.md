# API Reference

> **Demo / portfolio project. All data is fake.**

Base URL: `/api/v1` · JSON only · Requirements: [PRD §9](./PRD.md#9-api-v1) · Design: [architecture.md](./architecture.md)

> **Interactive docs:** run the API and open **`/api/docs`** (Swagger UI, "Try it out" works with the demo
> accounts). Machine-readable spec: **`/api/v1/openapi.json`** (OpenAPI 3.1). Input schemas are generated from
> the same Zod rules the API validates with, and a test fails if any route is undocumented.

Status: ✅ available · 🔜 planned

| Method | Path | Auth | Purpose | Status |
|---|---|---|---|---|
| GET | `/live` | — | Process is running (no database) | ✅ |
| GET | `/health` | — | API and database status | ✅ |
| POST | `/auth/login` | — (rate limited) | Log in, sets session cookie | ✅ |
| POST | `/auth/register` | — (rate limited) | Citizen sign-up, sets session cookie | ✅ |
| POST | `/auth/logout` | — | Clear session cookie | ✅ |
| GET | `/auth/me` | logged in | Current user | ✅ |
| GET | `/service-types` | — | Service catalog | ✅ |
| GET | `/locations/provinces` | — | 7 provinces | ✅ |
| GET | `/locations/districts?provinceId=` | — | Districts (all, or of one province) | ✅ |
| GET | `/locations/local-levels?districtId=` | — | Palikas of a district | ✅ |
| GET | `/locations/wards?localLevelId=` | — | Wards of a palika | ✅ |
| POST | `/requests` | citizen | Submit a request | ✅ |
| GET | `/requests/mine` | citizen | Own requests | ✅ |
| GET | `/requests` | staff (scoped) | Queue | ✅ |
| GET | `/requests/:id` | owner / scoped staff | Detail + history | ✅ |
| POST | `/requests/:id/transitions` | officer / citizen | Change status | ✅ |
| POST | `/requests/:id/fee-paid` | officer | Mark fee paid | ✅ |
| GET | `/track/:trackingCode` | — (rate limited) | Public tracking | ✅ |
| GET | `/stats/map` | — (public aggregates) | Delay map data + national totals | ✅ |
| GET | `/stats/summary` | palika / system admin | Report | ✅ |

---

## Conventions

### Errors
Every error has the same shape, and every response has an `X-Request-Id` header:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid input", "details": { "issues": [{ "path": "phone", "message": "Phone must be 10 digits" }] } },
  "requestId": "7ae71b02-ffb6-420b-aa95-a52e0ae46f40" }
```

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Bad body / query / params, broken or compressed JSON, body > 100 KB |
| `UNAUTHENTICATED` | 401 | Not logged in, bad or expired session, wrong phone/password |
| `FORBIDDEN` | 403 | Logged in but not allowed (role or scope) |
| `NOT_FOUND` | 404 | Unknown route or record |
| `CONFLICT` | 409 | Someone else updated the record first (stale `version`) |
| `INVALID_TRANSITION` | 422 | Workflow step not allowed now |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL` | 500 | Unexpected error (details only in server logs) |
| `UPSTREAM_UNAVAILABLE` | 503 | Outside service failed |

### Authentication
Session = JWT in the `sewa_session` cookie (`HttpOnly`, `SameSite=Lax`, `Secure` in production,
8 hours). Browsers send it automatically; with curl use a cookie jar (`-c` to save, `-b` to send).

### Access through the website only (deployed demo)
When the API has `PROXY_SECRET` set, every route except `/live` and `/health` needs the `X-Proxy-Secret`
header, which only the web app adds. A direct call to the API host gets `403 FORBIDDEN`. Use the API
through the website's `/api/*` path instead (Swagger UI: `/api/docs` on the website). Why: docs/deployment.md §5.
Locally the secret is unset and the check is off.

### Caching
Reference data (`/service-types`, `/locations/*`) is sent with `Cache-Control: public, max-age=3600`.

---

## Health

### `GET /live`
`200` `{ "status": "ok" }`. Never touches the database. For the keep-awake pinger: the free API host sleeps
after 15 minutes without requests, and pinging `/health` instead would keep the database awake too
(using up its free compute hours). **Liveness** (`/live`: is the process running?) vs **readiness**
(`/health`: can it serve real requests?).

### `GET /health`
`200` `{ "status": "ok", "db": "up", "version": "0.0.1", "commit": "local" }`
`503` `{ "status": "degraded", "db": "down", ... }` when the database is unreachable.

---

## Auth

### `POST /auth/login`
Body: `{ "email": "officer.ward1@example.com", "password": "demo1234" }` (email is lowercased; password 1–200 chars)

- `200` `{ "user": { "id", "role", "name", "email", "wardId", "localLevelId" } }` + `Set-Cookie: sewa_session=…`
- `400` invalid body · `401` unknown email **or** wrong password (same message for both) · `403` account deactivated · `429` after 5 attempts per minute per IP

### `POST /auth/register`
Body: `{ "name": "Sita Demo", "email": "sita@example.com", "password": "at-least-8" }`. Always creates a **CITIZEN**
(a `role` in the body is ignored). Demo rule: the email must end in `@example.com`.

- `201` `{ "user": … }` + session cookie (logged in) · `400` invalid (field in `details.issues`) · `409` email taken (`details.field = "email"`) · `429` 5 per minute

### `POST /auth/logout`
`204`, clears the cookie.

### `GET /auth/me`
`200` `{ "user": { … } }` · `401` without a valid session.

```bash
curl -c cookies.txt -X POST localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"officer.ward1@example.com","password":"demo1234"}'
curl -b cookies.txt localhost:4000/api/v1/auth/me
```

---

## Admin: user management (system admin only)

All three answer `401` without a session and `403` for any other role.

### `GET /admin/users?role=&q=&page=`
Newest first, 20 per page. `q` matches name or email. `200` `{ items: [{ id, role, name, email, isActive, wardId, wardNumber, localLevelId, palikaNameEn, createdAt }], page, pageSize, total }`.

### `POST /admin/users`
`{ "role": "WARD_OFFICER", "name", "email", "password", "wardId" }` or `{ "role": "PALIKA_ADMIN", …, "localLevelId" }`.
`201` `{ user }` · `400` wrong/missing scope, unknown ward/palika, non-demo email, or another role · `409` email taken.

### `PATCH /admin/users/:id`
`{ "isActive": false }` → the user can't log in and their open sessions stop at once. `200` · `403` target is a system admin · `404` unknown user.

---

## Reference data (public)

### `GET /service-types`
```json
{ "serviceTypes": [
  { "code": "LAND_BOUNDARY", "nameEn": "Land boundary (four-sides) verification", "nameNe": "चार किल्ला प्रमाणित",
    "feeNpr": 500, "serviceDays": 3, "requiresFieldVerification": true,
    "requiredDocuments": [{ "nameEn": "Land ownership certificate", "nameNe": "जग्गाधनी प्रमाणपुर्जा" }] } ] }
```
Fees and days are **demo values**.

### `GET /locations/provinces`
`{ "provinces": [{ "id": 1, "nameEn": "Koshi Province", "nameNe": "कोशी प्रदेश" }, …] }` (7, by id)

### `GET /locations/districts?provinceId=3`
`provinceId` optional. `{ "districts": [{ "id", "provinceId", "nameEn", "nameNe" }] }` sorted by name.
`400` bad id · `404` unknown province.

### `GET /locations/local-levels?districtId=27`
`districtId` required. `{ "localLevels": [{ "id", "districtId", "nameEn", "nameNe", "type" }] }`
`type` = `METRO` | `SUB_METRO` | `MUNICIPALITY` | `RURAL_MUNICIPALITY`. `400` / `404` as above.

### `GET /locations/wards?localLevelId=307`
`localLevelId` required. `{ "wards": [{ "id", "number" }] }` in number order. `400` / `404` as above.

---

## Requests

### `POST /requests` (citizen)
```json
{ "serviceTypeCode": "RESIDENCE", "wardId": 1234, "purpose": "Needed to open a bank account",
  "applicant": { "name": "Demo Applicant", "nid": "DEMO-1234567" }, "consent": true }
```
- `purpose` 10–500 chars · `applicant.nid` must be `DEMO-` + 7 digits (demo data only) · `consent` must be `true`
- In **one transaction**: the request (location ids copied from the ward), a `CREATED` audit event,
  and a `PENDING` identity check. If any step fails, nothing is saved.
- `201` `{ "request": { "id", "trackingCode": "ST-7K3QX9M2PD", "status": "SUBMITTED", "submittedAt" } }`
- `400` invalid body (field details) · `401` not logged in · `403` not a citizen · `404` unknown ward

### `GET /requests/mine` (citizen)
`200` `{ "requests": [{ "id", "trackingCode", "serviceTypeCode", "status", "wardId", "submittedAt",
"updatedAt", "closedAt", "overdue" }] }`, newest first, **only the caller's own** requests.

---

## Public tracking

### `GET /track/:trackingCode` (no login, 10 requests/min/IP)
The code is cleaned first: trimmed, uppercased, look-alikes mapped (`O`→`0`, `I`/`L`→`1`).

```json
{ "tracking": {
    "trackingCode": "ST-7K3QX9M2PD",
    "service": { "code": "LAND_BOUNDARY", "nameEn": "Land boundary (four-sides) verification", "nameNe": "चार किल्ला प्रमाणित" },
    "ward": { "number": 1 },
    "palika": { "nameEn": "Kathmandu", "nameNe": "काठमाण्डौं" },
    "status": "UNDER_REVIEW",
    "submittedAt": "2026-10-26T04:50:00.000Z", "updatedAt": "2026-10-26T05:10:00.000Z",
    "overdue": false,
    "timeline": [{ "status": "SUBMITTED", "at": "…" }, { "status": "UNDER_REVIEW", "at": "…" }] } }
```
**Only these fields, ever** (PRD F5): no applicant data, purpose, names, officer notes or internal ids.
The SQL selects only public columns, and a test plants private values and checks none appear.
`Cache-Control: no-store`. Errors: `400` malformed code · `404` unknown code · `429` rate limit.

---

## Staff queue and request detail

### `GET /requests?status=&serviceType=&overdue=&page=` (ward officer, palika admin, system admin)
**Scope comes from the logged-in user, never from the query string:** officer → own ward,
palika admin → own palika, system admin → all. Oldest first, 20 per page.

| Query | Values |
|---|---|
| `status` | one of the 8 statuses |
| `serviceType` | one of the 5 codes |
| `overdue` | `true` / `false` (same rule as the domain: open and past `submittedAt + serviceDays`) |
| `page` | 1, 2, … (default 1) |

`200` `{ "items": [{ "id", "trackingCode", "serviceTypeCode", "serviceNameEn", "status", "wardNumber",
"submittedAt", "overdue", "assignedOfficerName" }], "page": 1, "pageSize": 20, "total": 23 }`
`400` bad filter · `401` · `403` citizen.

### `GET /requests/:id` (owner citizen or scoped staff)
Full detail including applicant data and the history **with notes and actor names** (never public).
Also `version` (send it back with any change) and what **the current user** may do now:
`allowedTransitions` (e.g. `["UNDER_REVIEW"]` for an officer on a new request, `["CANCELLED"]` for its
owner, `[]` for admins) and `canMarkFeePaid`.
`400` not a uuid · `403` outside the user's ward/palika or not the owner · `404` unknown.

---

## Changing a request

Both endpoints use **optimistic locking** ([ADR-002](./decisions/ADR-002-optimistic-locking.md)):
send the `version` you loaded; if someone changed the request since, you get `409 CONFLICT`
("This request was updated by someone else. Reload to see the latest.").
The change and its audit row are saved in one transaction.

### `POST /requests/:id/transitions` (ward officer, own ward · citizen, own request)
```json
{ "toStatus": "NEEDS_DOCUMENTS", "version": 1, "note": "Please bring the plot map" }
```
`note` is required for NEEDS_DOCUMENTS, resubmitting (citizen: NEEDS_DOCUMENTS → UNDER_REVIEW) and
returning from field verification; `reason` is required for REJECTED.

`200` `{ "request": { "id", "status": "NEEDS_DOCUMENTS", "version": 2 } }`; the citizen is notified (demo: log line).

| Error | When |
|---|---|
| `400` | bad body, or a required note/reason missing |
| `403` | other ward / not your request / palika or system admin / wrong role for this move |
| `404` | unknown request |
| `409` | stale `version` |
| `422` | move not allowed now (e.g. approve before fee paid or before field verification) |

Allowed moves: see the state machine in [architecture.md §5](./architecture.md#5-the-request-workflow-state-machine).

### `POST /requests/:id/fee-paid` (ward officer, own ward)
`{ "version": 1 }` → `200` `{ "request": { "id", "status", "version": 2 } }` · audit event `FEE_PAID`.
`422` if the service is free, already paid, or the request is approved/closed. Same `403`/`404`/`409` rules.

---

## Statistics (aggregates only)

### `GET /stats/map?level=&metric=&serviceType=&status=&from=&to=&parentId=` (public)
| Param | Values |
|---|---|
| `level` | `district` (default) · `local_level` |
| `metric` | `overdue` (default) · `onTimeRate` · `pending` · `avgDaysToClose` |
| `serviceType`, `status` | optional filters |
| `from`, `to` | `YYYY-MM-DD`, by submission date (UTC), both inclusive |
| `parentId` | `level=district` → a province id · `level=local_level` → a district id (drill-down) |

```json
{ "level": "district", "metric": "overdue",
  "areas": [{ "areaId": 27, "value": 1, "total": 5 }],
  "totals": { "total": 6, "pending": 4, "overdue": 2, "closed": 2, "onTimeRate": 0.5, "avgDaysToClose": 1.8 } }
```
- **overdue** = open and past `submittedAt + serviceDays` · **pending** = open · **onTimeRate** = closed
  within service days ÷ all closed (0..1, `null` if nothing closed) · **avgDaysToClose** (1 decimal, `null` if none).
- Areas with no matching requests are absent. `totals` = the same filters over all areas (home page numbers).
- One SQL `GROUP BY`; every metric is computed with `count(*) FILTER (…)` and the requested one is picked.
- `Cache-Control: public, max-age=60` · `400` for unknown level/metric, bad dates, `from` after `to`.

### `GET /stats/summary` (palika admin: own palika · system admin: Nepal)
```json
{ "scope": { "kind": "palika", "localLevelId": 307 },
  "totals": { "total": 5, "pending": 3, "overdue": 1, "closed": 2, "onTimeRate": 0.5, "avgDaysToClose": 1.8 },
  "byStatus": [{ "status": "SUBMITTED", "count": 2 }], "byServiceType": [{ "code": "RESIDENCE", "count": 4 }],
  "byArea": [{ "areaId": 2743, "label": "Ward 1", "pending": 3, "overdue": 1 }] }
```
`byArea` = every ward of the palika (empty wards as 0) or, for the system admin, the 7 provinces.
`401` / `403` for other roles.
