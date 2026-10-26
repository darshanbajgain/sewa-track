-- 003_performance_indexes.sql: indexes chosen from EXPLAIN ANALYZE on 100k requests (docs/performance.md).
--
-- Each index matches a real query's WHERE + ORDER BY. Column order matters: the equality filter
-- first (ward_id = $1), then the sort column (submitted_at), then id (the tie-breaker in ORDER BY), so
-- Postgres can read rows already in order and skip the sort.
--
-- Trade-off: every index costs disk space and makes INSERT/UPDATE a little slower (each index must be
-- updated too). Measured in docs/performance.md. Postgres also does NOT index foreign keys by itself,
-- so lookups "by parent id" (events of a request) need explicit indexes.
--
-- Plain CREATE INDEX (not CONCURRENTLY): our runner wraps each migration in a transaction, and
-- CONCURRENTLY can't run inside one. On a big live table you would build them CONCURRENTLY to avoid
-- blocking writes.

-- Officer queue: WHERE ward_id = $1 ORDER BY submitted_at, id
CREATE INDEX service_requests_ward_queue_idx ON service_requests (ward_id, submitted_at, id);

-- Palika admin queue: WHERE local_level_id = $1 ORDER BY submitted_at, id
CREATE INDEX service_requests_palika_queue_idx ON service_requests (local_level_id, submitted_at, id);

-- Map drill-down and district reports: WHERE district_id = $1 (optionally a date range)
CREATE INDEX service_requests_district_idx ON service_requests (district_id, submitted_at);

-- Map filtered by service and date range: WHERE service_type_code = $1 AND submitted_at >= $2
CREATE INDEX service_requests_service_date_idx ON service_requests (service_type_code, submitted_at);

-- "My requests": WHERE citizen_id = $1 ORDER BY submitted_at DESC (also indexes this foreign key)
CREATE INDEX service_requests_citizen_idx ON service_requests (citizen_id, submitted_at DESC);

-- Request history: WHERE request_id = $1 ORDER BY created_at, id (foreign key, the fastest-growing table)
CREATE INDEX request_events_request_idx ON request_events (request_id, created_at, id);

-- Latest identity check of a request: WHERE request_id = $1 ORDER BY created_at DESC
CREATE INDEX identity_checks_request_idx ON identity_checks (request_id, created_at DESC);
