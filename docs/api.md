# API Reference

> **Demo / portfolio project. All data is fake.**

Base URL: `/api/v1` · JSON only · Requirements: [PRD §9](./PRD.md#9-api-v1) · Design: [architecture.md](./architecture.md)

Status: ✅ available · 🔜 planned

| Method | Path | Auth | Purpose | Status |
|---|---|---|---|---|
| GET | `/health` | — | API and database status | ✅ |
| POST | `/auth/login` | — (rate limited) | Log in, sets session cookie | ✅ |
| POST | `/auth/logout` | — | Clear session cookie | ✅ |
| GET | `/auth/me` | logged in | Current user | ✅ |
| GET | `/service-types` | — | Service catalog | ✅ |
| GET | `/locations/provinces` | — | 7 provinces | ✅ |
| GET | `/locations/districts?provinceId=` | — | Districts (all, or of one province) | ✅ |
| GET | `/locations/local-levels?districtId=` | — | Palikas of a district | ✅ |
| GET | `/locations/wards?localLevelId=` | — | Wards of a palika | ✅ |
| POST | `/requests` | citizen | Submit a request | ✅ |
| GET | `/requests/mine` | citizen | Own requests | ✅ |
| GET | `/requests` | staff (scoped) | Queue | 🔜 |
| GET | `/requests/:id` | owner / scoped staff | Detail + history | 🔜 |
| POST | `/requests/:id/transitions` | officer / citizen | Change status | 🔜 |
| POST | `/requests/:id/fee-paid` | officer | Mark fee paid | 🔜 |
| GET | `/track/:trackingCode` | — (rate limited) | Public tracking | ✅ |
| GET | `/stats/map` | — / admin | Map data | 🔜 |

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

### Caching
Reference data (`/service-types`, `/locations/*`) is sent with `Cache-Control: public, max-age=3600`.

---

## Health

### `GET /health`
`200` `{ "status": "ok", "db": "up", "version": "0.0.1", "commit": "local" }`
`503` `{ "status": "degraded", "db": "down", ... }` when the database is unreachable.

---

## Auth

### `POST /auth/login`
Body: `{ "phone": "9000000002", "password": "demo1234" }` (phone = 10 digits; password 1–200 chars)

- `200` `{ "user": { "id", "role", "name", "wardId", "localLevelId" } }` + `Set-Cookie: sewa_session=…`
- `400` invalid body · `401` wrong phone **or** password (same message for both) · `429` after 5 attempts per minute per IP

### `POST /auth/logout`
`204`, clears the cookie.

### `GET /auth/me`
`200` `{ "user": { … } }` · `401` without a valid session.

```bash
curl -c cookies.txt -X POST localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' -d '{"phone":"9000000002","password":"demo1234"}'
curl -b cookies.txt localhost:4000/api/v1/auth/me
```

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
