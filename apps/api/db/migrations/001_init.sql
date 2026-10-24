-- 001_init.sql: the initial schema (PRD §8).
--
-- Rules for migration files:
--   * Never edit a migration after it is merged; add a new numbered file instead.
--     (The runner stores a checksum and refuses to run if an applied file changed.)
--   * Each file runs inside ONE transaction: either all of it applies, or none of it.
--
-- Design notes:
--   * Constraints (NOT NULL, CHECK, FOREIGN KEY, UNIQUE) are the last line of defence:
--     even if the API has a bug, the database refuses invalid data.
--   * The CHECK lists of statuses/roles/codes must match packages/shared/src/enums.ts.
--   * Performance indexes (e.g. for the officer queue and the map) are added on purpose in a
--     LATER migration, so docs/performance.md can show EXPLAIN ANALYZE before and after.

-- ─────────────────────────────────────────────────────────────────────────────
-- Location hierarchy: province (7) → district (77) → local level / palika (753) → ward
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE provinces (
  id       smallint PRIMARY KEY,                -- fixed official numbering 1–7, not auto-generated
  name_en  text NOT NULL UNIQUE,
  name_ne  text NOT NULL UNIQUE
);

CREATE TABLE districts (
  id           smallint PRIMARY KEY,
  province_id  smallint NOT NULL REFERENCES provinces (id),
  name_en      text NOT NULL UNIQUE,
  name_ne      text NOT NULL UNIQUE
);

CREATE TABLE local_levels (
  id           integer PRIMARY KEY,
  district_id  smallint NOT NULL REFERENCES districts (id),
  name_en      text NOT NULL,
  name_ne      text NOT NULL,
  type         text NOT NULL CHECK (type IN ('METRO', 'SUB_METRO', 'MUNICIPALITY', 'RURAL_MUNICIPALITY')),
  lat          double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),   -- centroid, for the map
  lng          double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  -- The same palika name can exist in two districts, but not twice in one district.
  UNIQUE (district_id, name_en)
);

CREATE TABLE wards (
  id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  local_level_id  integer NOT NULL REFERENCES local_levels (id),
  number          smallint NOT NULL CHECK (number > 0),
  lat             double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),   -- generated demo point (approximate)
  lng             double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  UNIQUE (local_level_id, number)                                           -- "Ward 5" exists once per palika
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Users and roles
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- random id: not guessable, unlike 1, 2, 3…
  role            text NOT NULL CHECK (role IN ('CITIZEN', 'WARD_OFFICER', 'PALIKA_ADMIN', 'SYSTEM_ADMIN')),
  name            text NOT NULL,
  phone           text NOT NULL UNIQUE,                           -- login id; demo numbers only
  password_hash   text NOT NULL,                                  -- bcrypt hash, never the password
  ward_id         integer REFERENCES wards (id),
  local_level_id  integer REFERENCES local_levels (id),
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Each role has exactly the scope it needs (PRD §4), enforced by the database itself:
  --   ward officer → one ward; palika admin → one palika; citizen and system admin → no scope column.
  CONSTRAINT users_role_scope CHECK (
    (role = 'WARD_OFFICER' AND ward_id IS NOT NULL AND local_level_id IS NULL) OR
    (role = 'PALIKA_ADMIN' AND local_level_id IS NOT NULL AND ward_id IS NULL) OR
    (role IN ('CITIZEN', 'SYSTEM_ADMIN') AND ward_id IS NULL AND local_level_id IS NULL)
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Service catalog (PRD §5): the 5 request types, with demo fee and promised days
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE service_types (
  code                         text PRIMARY KEY
                               CHECK (code IN ('RELATIONSHIP', 'RESIDENCE', 'LOW_INCOME', 'LAND_BOUNDARY', 'DATE_OF_BIRTH')),
  name_en                      text NOT NULL,
  name_ne                      text NOT NULL,
  fee_npr                      integer NOT NULL CHECK (fee_npr >= 0),          -- money as whole rupees, never float
  service_days                 integer NOT NULL CHECK (service_days > 0),      -- charter promise, used for "overdue"
  requires_field_verification  boolean NOT NULL DEFAULT false,
  required_documents           jsonb NOT NULL DEFAULT '[]'::jsonb             -- [{ "nameEn": "...", "nameNe": "..." }]
                               CHECK (jsonb_typeof(required_documents) = 'array')
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Service requests: the core table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE service_requests (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Public code a citizen uses to track the request: "ST-" + 10 Crockford Base32 chars
  -- (no I, L, O, U, so it's easy to read aloud). Random, never sequential.
  tracking_code        text NOT NULL UNIQUE CHECK (tracking_code ~ '^ST-[0-9A-HJKMNP-TV-Z]{10}$'),
  citizen_id           uuid NOT NULL REFERENCES users (id),
  service_type_code    text NOT NULL REFERENCES service_types (code),

  -- Location copied at insert and NEVER changed (ADR-001). Storing all four levels lets the
  -- map count requests per district/palika with a simple GROUP BY, no joins up the hierarchy.
  ward_id              integer  NOT NULL REFERENCES wards (id),
  local_level_id       integer  NOT NULL REFERENCES local_levels (id),
  district_id          smallint NOT NULL REFERENCES districts (id),
  province_id          smallint NOT NULL REFERENCES provinces (id),

  status               text NOT NULL DEFAULT 'SUBMITTED'
                       CHECK (status IN ('SUBMITTED', 'UNDER_REVIEW', 'NEEDS_DOCUMENTS', 'FIELD_VERIFICATION',
                                         'APPROVED', 'REJECTED', 'ISSUED', 'CANCELLED')),
  purpose              text NOT NULL CHECK (char_length(purpose) BETWEEN 10 AND 500),
  applicant            jsonb NOT NULL,                     -- demo data only: { name, nid: "DEMO-..." }
  assigned_officer_id  uuid REFERENCES users (id),
  fee_paid_at          timestamptz,
  field_verified_at    timestamptz,

  -- Optimistic locking (ADR-002): every update does "WHERE id = $1 AND version = $2" and
  -- sets version = version + 1. If someone else updated first, 0 rows match → 409 CONFLICT.
  version              integer NOT NULL DEFAULT 0 CHECK (version >= 0),

  submitted_at         timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  closed_at            timestamptz,

  -- closed_at is set exactly when the request is in a final status, never otherwise.
  CONSTRAINT service_requests_closed_matches_status CHECK (
    (status IN ('ISSUED', 'REJECTED', 'CANCELLED')) = (closed_at IS NOT NULL)
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Audit log: one row for every change to a request. APPEND-ONLY.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE request_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,   -- bigint: this table grows fastest
  request_id   uuid NOT NULL REFERENCES service_requests (id),
  actor_id     uuid REFERENCES users (id),                        -- NULL = done by the system
  action       text NOT NULL CHECK (action IN ('CREATED', 'STATUS_CHANGED', 'FEE_PAID', 'REASSIGNED', 'IDENTITY_CHECKED')),
  from_status  text,
  to_status    text,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Enforce "append-only" in the database, not just in the API: any UPDATE or DELETE on
-- request_events raises an error, even if someone connects with psql and tries by hand.
-- (TRUNCATE, used only by the demo reset script, is a separate command and still works.)
CREATE FUNCTION request_events_block_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'request_events is append-only: % is not allowed', TG_OP;
END;
$$;

CREATE TRIGGER request_events_append_only
  BEFORE UPDATE OR DELETE ON request_events
  FOR EACH ROW EXECUTE FUNCTION request_events_block_changes();

-- ─────────────────────────────────────────────────────────────────────────────
-- Identity checks against the mock National ID service (PRD F9)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE identity_checks (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id   uuid NOT NULL REFERENCES service_requests (id),
  status       text NOT NULL CHECK (status IN ('PENDING', 'MATCH', 'NO_MATCH', 'FAILED')),
  attempts     smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  response_ms  integer CHECK (response_ms >= 0),
  created_at   timestamptz NOT NULL DEFAULT now()
);
