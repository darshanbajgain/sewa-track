-- 005_request_documents.sql: supporting documents for a request (PRD F15).
--
-- Decision (2026-11-03, owner): the officer names the documents they need (from the service's
-- list or their own), the citizen uploads one file per name, the officer accepts each or marks it
-- "not OK" with a reason. Files are small demo files stored in Postgres (bytea): no extra storage
-- service to run or secure. Limits (type, 2 MB, 10 per request) are checked in the API AND here.

CREATE TABLE request_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES service_requests (id),
  name          text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 200),

  -- REQUESTED = asked for, no file yet · UPLOADED = waiting for the officer · ACCEPTED · REJECTED = "not OK"
  status        text NOT NULL CHECK (status IN ('REQUESTED', 'UPLOADED', 'ACCEPTED', 'REJECTED')),
  requested_by  uuid REFERENCES users (id),          -- the officer who asked; NULL = added by the citizen
  review_note   text CHECK (char_length(review_note) <= 1000),
  reviewed_by   uuid REFERENCES users (id),
  reviewed_at   timestamptz,

  -- The file (all NULL until the first upload).
  file_name     text CHECK (char_length(file_name) BETWEEN 1 AND 200),
  content_type  text CHECK (content_type IN ('image/jpeg', 'image/png', 'application/pdf')),
  size_bytes    integer CHECK (size_bytes BETWEEN 1 AND 2097152),   -- 2 MB
  data          bytea,
  uploaded_at   timestamptz,

  created_at    timestamptz NOT NULL DEFAULT now(),

  -- One slot per document name on a request ("asking again" reuses the slot).
  CONSTRAINT request_documents_name_key UNIQUE (request_id, name),
  -- The file columns are all set or all empty, and a slot that is not REQUESTED always has a file.
  CONSTRAINT request_documents_file_complete CHECK (
    (data IS NULL) = (file_name IS NULL) AND (data IS NULL) = (content_type IS NULL)
    AND (data IS NULL) = (size_bytes IS NULL) AND (data IS NULL) = (uploaded_at IS NULL)
  ),
  CONSTRAINT request_documents_file_matches_status CHECK ((status = 'REQUESTED') = (data IS NULL))
);
-- The UNIQUE (request_id, name) index also serves "all documents of request X".

-- Two new audit actions. The CHECK from 001 has a generated name, so drop it by looking it up.
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
  WHERE conrelid = 'request_events'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%action%';
  EXECUTE format('ALTER TABLE request_events DROP CONSTRAINT %I', c);
END $$;

ALTER TABLE request_events ADD CONSTRAINT request_events_action_check CHECK (action IN (
  'CREATED', 'STATUS_CHANGED', 'FEE_PAID', 'REASSIGNED', 'IDENTITY_CHECKED', 'DOCUMENT_UPLOADED', 'DOCUMENT_REVIEWED'
));
