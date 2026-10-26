import type { EventAction, RequestStatus, ServiceTypeCode } from '@sewa/shared';
import { QUEUE_PAGE_SIZE } from '@sewa/shared';
import { pool } from '../db/pool.js';

/**
 * Queries for the staff queue and the request detail page.
 *
 * "Overdue" in SQL must match domain/overdue.ts exactly:
 *   not final AND now > submitted_at + service_days days
 * `now` is passed as a parameter ($7) instead of calling now() in SQL, so tests control the clock
 * and the SQL and the domain function always use the same moment.
 */
const OVERDUE_SQL = `(r.status NOT IN ('ISSUED', 'REJECTED', 'CANCELLED')
                      AND $7::timestamptz > r.submitted_at + st.service_days * interval '1 day')`;

export interface QueueFilters {
  wardId: number | null; // scope: officer
  localLevelId: number | null; // scope: palika admin
  status?: RequestStatus | undefined;
  serviceType?: ServiceTypeCode | undefined;
  overdue?: boolean | undefined;
  page: number;
  now: Date;
}

export interface QueueRow {
  id: string;
  trackingCode: string;
  serviceTypeCode: ServiceTypeCode;
  serviceNameEn: string;
  status: RequestStatus;
  wardNumber: number;
  submittedAt: Date;
  overdue: boolean;
  assignedOfficerName: string | null;
  total: number;
}

/**
 * One query for: scope + optional filters + oldest first + one page + the total count.
 *
 *  - Optional filter pattern: `($1::int IS NULL OR r.ward_id = $1)`. Passing NULL switches the
 *    filter off. The SQL text never changes; only the parameters do, so it's injection-safe.
 *  - `count(*) OVER ()` is a WINDOW FUNCTION: it counts all matching rows (before LIMIT) and puts
 *    that number on every returned row, so we get the page AND the total in one round trip.
 *  - `ORDER BY submitted_at, id`: oldest first (PRD F6); `id` makes the order stable for paging.
 *  - LEFT JOIN users: many requests have no assigned officer yet; INNER JOIN would hide them.
 *
 * Exported so `pnpm db:explain` measures exactly the SQL the API runs.
 */
export const LIST_QUEUE_SQL = `
    SELECT r.id,
           r.tracking_code     AS "trackingCode",
           r.service_type_code AS "serviceTypeCode",
           st.name_en          AS "serviceNameEn",
           r.status,
           w.number            AS "wardNumber",
           r.submitted_at      AS "submittedAt",
           ${OVERDUE_SQL}      AS overdue,
           officer.name        AS "assignedOfficerName",
           count(*) OVER ()::int AS total
    FROM service_requests r
    JOIN service_types st  ON st.code = r.service_type_code
    JOIN wards w           ON w.id = r.ward_id
    LEFT JOIN users officer ON officer.id = r.assigned_officer_id
    WHERE ($1::int  IS NULL OR r.ward_id = $1)
      AND ($2::int  IS NULL OR r.local_level_id = $2)
      AND ($3::text IS NULL OR r.status = $3)
      AND ($4::text IS NULL OR r.service_type_code = $4)
      AND ($5::boolean IS NULL OR ${OVERDUE_SQL} = $5)
    ORDER BY r.submitted_at ASC, r.id ASC
    LIMIT ${QUEUE_PAGE_SIZE} OFFSET $6`;

export async function listQueue(f: QueueFilters): Promise<QueueRow[]> {
  const { rows } = await pool.query<QueueRow>(LIST_QUEUE_SQL, [
    f.wardId,
    f.localLevelId,
    f.status ?? null,
    f.serviceType ?? null,
    f.overdue ?? null,
    (f.page - 1) * QUEUE_PAGE_SIZE, // page 1 → skip 0, page 2 → skip 20, ...
    f.now,
  ]);
  return rows;
}

export interface DetailRow {
  id: string;
  trackingCode: string;
  status: RequestStatus;
  version: number;
  citizenId: string;
  wardId: number;
  localLevelId: number;
  wardNumber: number;
  palikaNameEn: string;
  palikaNameNe: string;
  districtNameEn: string;
  serviceCode: ServiceTypeCode;
  serviceNameEn: string;
  serviceNameNe: string;
  feeNpr: number;
  serviceDays: number;
  requiresFieldVerification: boolean;
  purpose: string;
  applicant: { name: string; nid: string };
  assignedOfficerId: string | null;
  assignedOfficerName: string | null;
  feePaidAt: Date | null;
  fieldVerifiedAt: Date | null;
  submittedAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
}

/** Everything about one request (the service decides who may see it). */
export async function findRequestDetail(id: string): Promise<DetailRow | null> {
  const { rows } = await pool.query<DetailRow>(
    `SELECT r.id, r.tracking_code AS "trackingCode", r.status, r.version,
            r.citizen_id AS "citizenId", r.ward_id AS "wardId", r.local_level_id AS "localLevelId",
            w.number AS "wardNumber", l.name_en AS "palikaNameEn", l.name_ne AS "palikaNameNe",
            d.name_en AS "districtNameEn",
            st.code AS "serviceCode", st.name_en AS "serviceNameEn", st.name_ne AS "serviceNameNe",
            st.fee_npr AS "feeNpr", st.service_days AS "serviceDays",
            st.requires_field_verification AS "requiresFieldVerification",
            r.purpose, r.applicant,
            r.assigned_officer_id AS "assignedOfficerId", officer.name AS "assignedOfficerName",
            r.fee_paid_at AS "feePaidAt", r.field_verified_at AS "fieldVerifiedAt",
            r.submitted_at AS "submittedAt", r.updated_at AS "updatedAt", r.closed_at AS "closedAt"
     FROM service_requests r
     JOIN service_types st  ON st.code = r.service_type_code
     JOIN wards w           ON w.id = r.ward_id
     JOIN local_levels l    ON l.id = r.local_level_id
     JOIN districts d       ON d.id = r.district_id
     LEFT JOIN users officer ON officer.id = r.assigned_officer_id
     WHERE r.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export interface EventRow {
  action: EventAction;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus | null;
  note: string | null;
  actorName: string | null;
  at: Date;
}

/** Full history for staff and the owner: with notes and who did it (LEFT JOIN: system events have no actor). */
export const FIND_EVENTS_SQL = `
  SELECT e.action, e.from_status AS "fromStatus", e.to_status AS "toStatus", e.note,
         u.name AS "actorName", e.created_at AS at
  FROM request_events e
  LEFT JOIN users u ON u.id = e.actor_id
  WHERE e.request_id = $1
  ORDER BY e.created_at, e.id`;

export async function findEvents(requestId: string): Promise<EventRow[]> {
  const { rows } = await pool.query<EventRow>(FIND_EVENTS_SQL, [requestId]);
  return rows;
}

/** The newest identity check of a request, if any. */
export async function findLatestIdentityCheck(
  requestId: string,
): Promise<{ status: 'PENDING' | 'MATCH' | 'NO_MATCH' | 'FAILED'; attempts: number } | null> {
  const { rows } = await pool.query(
    `SELECT status, attempts FROM identity_checks WHERE request_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [requestId],
  );
  return rows[0] ?? null;
}
