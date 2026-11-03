# Security policy

Sewa Track is a **demo / portfolio project**. It is not affiliated with any government body, holds only
fake data, and is not meant for real citizen information.

## Reporting a vulnerability

Please report security problems **privately**, not in a public issue:

- GitHub → this repository → **Security** tab → **Report a vulnerability** (private vulnerability reporting).

Include what you found, how to reproduce it, and what an attacker could do with it. You'll get an answer
within a few days. Please give a reasonable time to fix it before sharing details publicly.

## Supported versions

Only the latest release and the `main` branch get fixes. The live demo (<https://sewa-track.vercel.app>)
always runs `main`.

## Testing the live demo

Allowed: normal use with the [demo accounts](README.md#demo-accounts), and careful manual testing of your
own requests. Please **do not**:

- run load tests, scanners or brute-force against the live demo (it runs on free hosting and has rate limits)
- try to access other people's accounts or data
- upload real documents or enter real personal information (everything here must be fake)

The demo database can be reset at any time (`pnpm demo:reset`).

## What is in place

A short list, so reports can focus on what matters. Details: [docs/architecture.md](docs/architecture.md),
[docs/frontend.md](docs/frontend.md) (§ Security), [docs/deployment.md](docs/deployment.md).

- **Sessions:** JWT in an `httpOnly`, `SameSite=Lax` (and `Secure` in production) cookie; never readable by
  JavaScript. Deactivating an account ends its sessions immediately.
- **Authorization on the server:** role check on every route, plus scope on every row (a ward officer sees
  only their ward, a palika admin only their palika, a citizen only their own requests).
- **Input:** every body, query and parameter validated with Zod; SQL always parameterized.
- **Errors and logs:** one error format, no stack traces in responses, personal data redacted from logs.
- **Rate limits:** login, sign-up and public tracking, per real visitor IP.
- **Deployed API:** only the website can call it (shared secret checked in constant time).
- **Uploads:** JPEG/PNG/PDF only, decided from the file's bytes; 2 MB; downloads with `nosniff`,
  `Content-Security-Policy: sandbox` and `Cache-Control: private, no-store`.
- **Supply chain:** `pnpm audit` and secret scanning on every pull request; full history scanned with gitleaks.
