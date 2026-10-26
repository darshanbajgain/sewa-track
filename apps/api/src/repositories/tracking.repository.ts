import type { RequestStatus, ServiceTypeCode } from '@sewa/shared';
import { pool } from '../db/pool.js';

/**
 * Queries for PUBLIC tracking. Privacy by design: the SELECT lists only public columns.
 * applicant, purpose, citizen_id, officer and notes are never read here, so they can't leak
 * even if someone later adds a field to the response by mistake.
 */

export interface TrackingRow {
  requestId: string; // internal: used for the timeline query, never sent to the client
  trackingCode: string;
  serviceCode: ServiceTypeCode;
  serviceNameEn: string;
  serviceNameNe: string;
  serviceDays: number;
  wardNumber: number;
  palikaNameEn: string;
  palikaNameNe: string;
  status: RequestStatus;
  submittedAt: Date;
  updatedAt: Date;
}

export async function findTrackingRow(trackingCode: string): Promise<TrackingRow | null> {
  // INNER JOINs: every request always has a service type, a ward and a palika (NOT NULL + FK).
  const { rows } = await pool.query<TrackingRow>(
    `SELECT r.id                AS "requestId",
            r.tracking_code     AS "trackingCode",
            st.code             AS "serviceCode",
            st.name_en          AS "serviceNameEn",
            st.name_ne          AS "serviceNameNe",
            st.service_days     AS "serviceDays",
            w.number            AS "wardNumber",
            l.name_en           AS "palikaNameEn",
            l.name_ne           AS "palikaNameNe",
            r.status,
            r.submitted_at      AS "submittedAt",
            r.updated_at        AS "updatedAt"
     FROM service_requests r
     JOIN service_types st ON st.code = r.service_type_code
     JOIN wards w          ON w.id = r.ward_id
     JOIN local_levels l   ON l.id = r.local_level_id
     WHERE r.tracking_code = $1`, // uses the UNIQUE index on tracking_code: one fast lookup
    [trackingCode],
  );
  return rows[0] ?? null;
}

/**
 * Public timeline: WHEN the status changed and TO WHAT. Not who did it, and not the note.
 * Events without a status (e.g. FEE_PAID) are skipped. `id` breaks ties for same-time events.
 */
export async function findPublicTimeline(requestId: string): Promise<{ status: RequestStatus; at: Date }[]> {
  const { rows } = await pool.query<{ status: RequestStatus; at: Date }>(
    `SELECT to_status AS status, created_at AS at
     FROM request_events
     WHERE request_id = $1 AND to_status IS NOT NULL
     ORDER BY created_at, id`,
    [requestId],
  );
  return rows;
}
