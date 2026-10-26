import type { RequestStatus } from '@sewa/shared';
import { pool } from '../db/pool.js';
import type { DbClient } from '../db/transaction.js';

/** Everything the rules need to decide about a change, in one read. */
export interface ChangeFacts {
  id: string;
  trackingCode: string;
  status: RequestStatus;
  version: number;
  citizenId: string;
  wardId: number;
  localLevelId: number;
  feeNpr: number;
  feePaidAt: Date | null;
  requiresFieldVerification: boolean;
  fieldVerifiedAt: Date | null;
}

export async function findChangeFacts(id: string): Promise<ChangeFacts | null> {
  const { rows } = await pool.query<ChangeFacts>(
    `SELECT r.id, r.tracking_code AS "trackingCode", r.status, r.version,
            r.citizen_id AS "citizenId", r.ward_id AS "wardId", r.local_level_id AS "localLevelId",
            st.fee_npr AS "feeNpr", r.fee_paid_at AS "feePaidAt",
            st.requires_field_verification AS "requiresFieldVerification",
            r.field_verified_at AS "fieldVerifiedAt"
     FROM service_requests r
     JOIN service_types st ON st.code = r.service_type_code
     WHERE r.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export interface StatusUpdate {
  id: string;
  expectedVersion: number; // the version the user saw
  toStatus: RequestStatus;
  assignOfficerId: string | null; // set only if empty (first officer to start the review)
  setFieldVerifiedAt: boolean;
  setClosedAt: boolean;
}

/**
 * OPTIMISTIC LOCKING (ADR-002). The heart of safe concurrent edits.
 *
 *   UPDATE ... SET version = version + 1 ... WHERE id = $1 AND version = $2
 *
 * If nobody changed the row since the user loaded it, version still matches → 1 row updated.
 * If someone else changed it first, version moved on → 0 rows → we return null → 409 CONFLICT.
 *
 * Why it also works for two requests at the SAME instant: Postgres locks the row during an UPDATE.
 * The second UPDATE waits, then re-checks its WHERE against the NEW row (version is now +1),
 * matches nothing, and updates 0 rows. Exactly one winner, guaranteed by the database.
 *
 * Effects (from domain/transitions.ts), written in the same statement:
 *   COALESCE(assigned_officer_id, $4) → keep the current officer; set ours only if there was none
 *   CASE WHEN $5 THEN now() ...       → stamp field_verified_at / closed_at only when the rule says so
 */
export async function updateStatusWithVersion(
  client: DbClient,
  u: StatusUpdate,
): Promise<{ status: RequestStatus; version: number } | null> {
  const { rows } = await client.query<{ status: RequestStatus; version: number }>(
    `UPDATE service_requests
     SET status              = $3,
         version             = version + 1,
         updated_at          = now(),
         assigned_officer_id = COALESCE(assigned_officer_id, $4),
         field_verified_at   = CASE WHEN $5 THEN now() ELSE field_verified_at END,
         closed_at           = CASE WHEN $6 THEN now() ELSE closed_at END
     WHERE id = $1 AND version = $2
     RETURNING status, version`,
    [u.id, u.expectedVersion, u.toStatus, u.assignOfficerId, u.setFieldVerifiedAt, u.setClosedAt],
  );
  return rows[0] ?? null; // null = 0 rows = someone else changed it first
}

/** Same locking idea for "mark fee paid". `fee_paid_at IS NULL` also blocks paying twice. */
export async function markFeePaidWithVersion(
  client: DbClient,
  id: string,
  expectedVersion: number,
): Promise<{ status: RequestStatus; version: number } | null> {
  const { rows } = await client.query<{ status: RequestStatus; version: number }>(
    `UPDATE service_requests
     SET fee_paid_at = now(), version = version + 1, updated_at = now()
     WHERE id = $1 AND version = $2 AND fee_paid_at IS NULL
     RETURNING status, version`,
    [id, expectedVersion],
  );
  return rows[0] ?? null;
}
