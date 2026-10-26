import type { MapLevel, RequestStatus, ServiceTypeCode } from '@sewa/shared';
import { pool } from '../db/pool.js';

/**
 * Aggregate statistics (PRD F7, F8). Every query returns COUNTS per group, never single requests.
 *
 * One query computes ALL metrics at once with `count(*) FILTER (WHERE …)`: a conditional count
 * ("count the rows where …"), one pass over the data. The API then just PICKS the metric the user
 * asked for, so the metric name never touches the SQL.
 *
 * The rules match domain/overdue.ts exactly (open = not final; overdue = open and
 * now > submitted_at + service_days days; on time = closed_at <= submitted_at + service_days days).
 * `now` is a parameter so tests and the domain use the same moment.
 */
const OPEN = `r.status NOT IN ('ISSUED', 'REJECTED', 'CANCELLED')`;
const DUE = `r.submitted_at + st.service_days * interval '1 day'`;

/**
 * The counters every stats query returns per group. This fragment is reused by several queries in
 * which `now` sits at a different parameter position, so it says `$NOW` and each query replaces it
 * with its own `$n`. A fixed placeholder from our own code, never user input.
 */
const METRIC_COLUMNS = `
  count(*)::int                                                         AS total,
  count(*) FILTER (WHERE ${OPEN})::int                                  AS pending,
  count(*) FILTER (WHERE ${OPEN} AND $NOW::timestamptz > ${DUE})::int   AS overdue,
  count(*) FILTER (WHERE r.closed_at IS NOT NULL)::int                  AS closed,
  count(*) FILTER (WHERE r.closed_at IS NOT NULL AND r.closed_at <= ${DUE})::int AS "closedOnTime",
  (avg(extract(epoch FROM r.closed_at - r.submitted_at) / 86400)
     FILTER (WHERE r.closed_at IS NOT NULL))::float8                    AS "avgDaysToClose"`;

export interface Counters {
  total: number;
  pending: number;
  overdue: number;
  closed: number;
  closedOnTime: number;
  avgDaysToClose: number | null;
}

/**
 * Allow-list: the ONLY column names that can be put into the SQL text.
 * Column names can't be $n parameters, so the user's `level` picks one of these fixed strings.
 */
const GROUP_COLUMN: Record<MapLevel, { area: string; parent: string }> = {
  district: { area: 'r.district_id', parent: 'r.province_id' },
  local_level: { area: 'r.local_level_id', parent: 'r.district_id' },
};

export interface MapFilters {
  level: MapLevel;
  serviceType?: ServiceTypeCode | undefined;
  status?: RequestStatus | undefined;
  from?: Date | undefined; // inclusive
  toExclusive?: Date | undefined; // exclusive (the day after "to")
  parentId?: number | undefined;
  now: Date;
}

/**
 * The map query: ONE GROUP BY over service_requests, no joins up the location hierarchy, because
 * the location ids were copied onto each request at insert (ADR-001). Optional filters use the
 * `($n IS NULL OR …)` pattern.
 */
export async function countByArea(f: MapFilters): Promise<(Counters & { areaId: number })[]> {
  const col = GROUP_COLUMN[f.level];
  const sql = `
    SELECT ${col.area} AS "areaId", ${METRIC_COLUMNS}
    FROM service_requests r
    JOIN service_types st ON st.code = r.service_type_code
    WHERE ($1::text IS NULL OR r.service_type_code = $1)
      AND ($2::text IS NULL OR r.status = $2)
      AND ($3::timestamptz IS NULL OR r.submitted_at >= $3)
      AND ($4::timestamptz IS NULL OR r.submitted_at < $4)
      AND ($5::int IS NULL OR ${col.parent} = $5)
    GROUP BY ${col.area}
    ORDER BY ${col.area}`.replaceAll('$NOW', '$6');

  const { rows } = await pool.query(sql, [
    f.serviceType ?? null,
    f.status ?? null,
    f.from ?? null,
    f.toExclusive ?? null,
    f.parentId ?? null,
    f.now,
  ]);
  return rows;
}

/** Totals for a scope: one palika (localLevelId) or all of Nepal (null). */
export async function countTotals(localLevelId: number | null, now: Date): Promise<Counters> {
  const { rows } = await pool.query(
    `SELECT ${METRIC_COLUMNS.replaceAll('$NOW', '$2')}
     FROM service_requests r JOIN service_types st ON st.code = r.service_type_code
     WHERE ($1::int IS NULL OR r.local_level_id = $1)`,
    [localLevelId, now],
  );
  return rows[0];
}

export async function countByStatus(localLevelId: number | null): Promise<{ status: RequestStatus; count: number }[]> {
  const { rows } = await pool.query(
    `SELECT status, count(*)::int AS count FROM service_requests
     WHERE ($1::int IS NULL OR local_level_id = $1)
     GROUP BY status ORDER BY status`,
    [localLevelId],
  );
  return rows;
}

export async function countByServiceType(localLevelId: number | null): Promise<{ code: ServiceTypeCode; count: number }[]> {
  const { rows } = await pool.query(
    `SELECT service_type_code AS code, count(*)::int AS count FROM service_requests
     WHERE ($1::int IS NULL OR local_level_id = $1)
     GROUP BY service_type_code ORDER BY service_type_code`,
    [localLevelId],
  );
  return rows;
}

/**
 * Pending and overdue per ward of one palika. Starts FROM wards with a LEFT JOIN, so wards with
 * no requests still appear with 0 (and count(r.id), not count(*), so an empty ward counts 0, not 1).
 */
export async function countByWard(
  localLevelId: number,
  now: Date,
): Promise<{ areaId: number; label: string; pending: number; overdue: number }[]> {
  const { rows } = await pool.query(
    `SELECT w.id AS "areaId", 'Ward ' || w.number AS label,
            count(r.id) FILTER (WHERE ${OPEN})::int AS pending,
            count(r.id) FILTER (WHERE ${OPEN} AND $2::timestamptz > ${DUE})::int AS overdue
     FROM wards w
     LEFT JOIN service_requests r ON r.ward_id = w.id
     LEFT JOIN service_types st   ON st.code = r.service_type_code
     WHERE w.local_level_id = $1
     GROUP BY w.id, w.number
     ORDER BY w.number`,
    [localLevelId, now],
  );
  return rows;
}

/** Pending and overdue per province (national view), all 7 provinces even with 0. */
export async function countByProvince(now: Date): Promise<{ areaId: number; label: string; pending: number; overdue: number }[]> {
  const { rows } = await pool.query(
    `SELECT p.id AS "areaId", p.name_en AS label,
            count(r.id) FILTER (WHERE ${OPEN})::int AS pending,
            count(r.id) FILTER (WHERE ${OPEN} AND $1::timestamptz > ${DUE})::int AS overdue
     FROM provinces p
     LEFT JOIN service_requests r ON r.province_id = p.id
     LEFT JOIN service_types st   ON st.code = r.service_type_code
     GROUP BY p.id, p.name_en
     ORDER BY p.id`,
    [now],
  );
  return rows;
}
