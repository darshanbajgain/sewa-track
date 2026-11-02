# ADR-003: Real accounts: citizen sign-up, admin-created staff, demo-only emails

- **Status:** Accepted
- **Date:** 2026-11-01

## Context
v1 had only one-click demo login buttons, chosen so the public demo would never collect real personal data.
The owner wants the real flows a public-service app needs: citizens register themselves, and staff
accounts are assigned centrally. The privacy rule (AGENTS §3.3, Nepal's Individual Privacy Act 2075) still
applies: the public demo must not store real phone numbers or emails.

## Decision
- **Login id = email** for every role (stored lowercase; `UNIQUE`, `CHECK (email = lower(email))`).
  Phone becomes optional. Migration `004_accounts.sql`.
- **Demo rule:** new accounts must use `@example.com`, a domain reserved for examples (RFC 2606) that can
  never be a real mailbox. The rule is in the shared Zod schema (`DEMO_EMAIL_DOMAIN`), not in the database,
  so a real deployment lifts it with a one-line change and no migration.
- **Citizen sign-up:** `POST /auth/register` always creates `CITIZEN`; the role is never read from the body.
- **Staff:** only `SYSTEM_ADMIN` creates `WARD_OFFICER` (with a ward) and `PALIKA_ADMIN` (with a palika),
  via `/admin/users`. `created_by` records who. System admins are not created or deactivated from the UI.
- **Deactivate, never delete:** `is_active = false`. Requests and audit rows keep pointing at the user.
  `requireAuth` checks `is_active` on every request (one primary-key lookup), so deactivation is immediate
  instead of waiting up to 8 hours for the JWT to expire.
- **Duplicate email** at sign-up → `409`. `INSERT … ON CONFLICT (email) DO NOTHING` lets the UNIQUE
  constraint decide, so two simultaneous sign-ups can't both win.

## Alternatives considered
- **Phone numbers restricted to a fake range:** works, but email is the usual login id and enables a future
  "forgot password" flow.
- **Any real email:** realistic, but the public demo would then hold real personal data.
- **Check `is_active` only at login:** cheaper, but a deactivated officer could keep working for hours.

## Consequences
- Sign-up reveals whether an email is registered (409). Accepted trade-off of every sign-up form;
  limited by a 5/min rate limit.
- One extra indexed query per authenticated request.
- Demo login buttons are replaced by a "Demo mode" panel that fills the normal form.
