-- 004_accounts.sql: real accounts instead of demo buttons only.
--
-- Decision (2026-11-01, owner; see docs/decisions/ADR-003-accounts.md):
--   * Citizens sign up themselves; staff accounts are created ONLY by a system admin.
--   * Login id = email. On the public demo only @example.com addresses are accepted (a domain
--     reserved for examples, RFC 2606), so no real personal data is stored. That rule lives in the
--     app (packages/shared), not here, so lifting it later needs no migration.
--   * Phone becomes optional (not asked at sign-up).
--   * Accounts can be deactivated (never deleted: requests and audit rows point at them).

ALTER TABLE users
  ADD COLUMN email      text,
  ADD COLUMN is_active  boolean NOT NULL DEFAULT true,
  ADD COLUMN created_by uuid REFERENCES users (id);   -- which system admin created this staff account

-- Existing rows need an email before the column can be NOT NULL. Every existing user has a phone,
-- so derive a unique placeholder from it (the seed then sets the readable demo emails).
UPDATE users SET email = 'user-' || phone || '@example.com' WHERE email IS NULL;

ALTER TABLE users
  ALTER COLUMN email SET NOT NULL,
  ALTER COLUMN phone DROP NOT NULL,
  -- Stored lowercase, so "Ram@Example.com" and "ram@example.com" can't be two accounts.
  ADD CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
  ADD CONSTRAINT users_email_key UNIQUE (email);
