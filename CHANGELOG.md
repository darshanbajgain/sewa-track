# Changelog

All notable changes to Sewa Track. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/). Numbers in brackets are pull requests.

> Demo / portfolio project. Not affiliated with any government body.

## [Unreleased]

### Added
- Mock National ID service (`apps/nid-mock`) and an API client with a 2 s timeout and 2 retries (200 ms, 400 ms), with a shared contract tested on both sides (#41).
- Each new request's applicant is checked with that service after the citizen gets their reply; the result (`MATCH`, `NO_MATCH` or `FAILED`) and an `IDENTITY_CHECKED` history event are stored together. Off unless `NID_BASE_URL` is set.
- Docker image and a `nid-mock` service in docker compose; CI builds the image.

## [0.1.0] — 2026-11-04

First public release. Live demo: <https://sewa-track.vercel.app>.

### Added
- **Data and rules**
  - PostgreSQL schema with constraints and an append-only audit log (blocked by a trigger), and our own migration runner (#2).
  - Reference data: 7 provinces, 77 districts, 753 local levels, 6,743 wards, 5 demo services (#4).
  - Workflow rules in one pure module: transitions, overdue, tracking codes, fee payment (#5).
- **API**
  - Accounts and roles: citizen sign-up, email login with httpOnly JWT cookie, demo accounts (#6, #19).
  - Service catalog and location hierarchy (#7).
  - Submit a request, my requests (#8); public tracking by code with no personal data (#9).
  - Staff queue scoped by ward/palika (#10).
  - Status changes and fee paid with optimistic locking and the audit event in the same transaction (#11).
  - Delay-map statistics and staff reports (#12).
  - OpenAPI 3.1 spec and Swagger UI generated from the shared Zod schemas (#14).
- **Web**
  - Next.js app in English and Nepali (#15).
  - Citizen portal (#16) and staff portal (#17).
  - National service-delay map on Nepal's official 2020 district boundaries (#18).
  - One portal per role and system-admin user management (#20).
  - Separate citizen and staff login pages, enforced by the API (#27).
  - Staff request screen with a progress bar, one clear next step and a checklist (#30).
  - Supporting documents: the officer names what's needed, the citizen uploads (JPEG/PNG/PDF), the officer accepts or marks it "not OK" (#31, #33).
  - Demo notice on load and a DEMO pill on every page; a simpler home with "Apply for this" per service (#36).
  - Skeleton loading and scrolling table cards (#37).
- **Operations**
  - Docker images and a full compose stack with a migration release step (#21).
  - `/live` liveness endpoint and a "waking up" notice for the free-tier API (#22).
  - `pnpm demo:reset`: public Birtamod demo accounts, a private system admin from env, and 2,000 anonymous sample requests outside Birtamod (#38).
- **Performance:** a 100k-request seed, indexes chosen with `EXPLAIN ANALYZE`, and a measured report (#13).

### Security
- Patched a body-parser DoS and added a dependency audit to CI (#3).
- Only the website may call the deployed API (a shared proxy secret); rate limits per real visitor IP (#23, #24).
- Uploaded files: type decided from the file's bytes, 2 MB limit, cleaned names, `nosniff` + `CSP: sandbox` + `no-store` on download (#31). multer 2.5.0 (GHSA-q7qp-rjg7-q26m).
- The API's own security headers are kept on forwarded `/api` responses (#34).
- Full git history scanned with gitleaks before going public: no leaks.

### Changed
- Styled, accessible dropdowns and date picker, one focus style, per-page titles (#28).
- Logged-in users see only their portal's menu; public pages are for visitors (#29).
- Home page simplified; the delay map lives on `/stats` (#35, #36).

### Fixed
- The Vercel build fails clearly when `API_ORIGIN` is missing (#26).
- A staff portal URL with a query (`/ward?status=…`) now leads to the staff login (#36).
- `demo:reset` fails fast on a stalled database connection instead of hanging (#38).

[0.1.0]: https://github.com/darshanbajgain/sewa-track/releases/tag/v0.1.0
