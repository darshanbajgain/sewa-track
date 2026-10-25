import type { CreateRequestInput, RequestStatus, ServiceTypeCode } from '@sewa/shared';
import { pool } from '../db/pool.js';
import type { DbClient } from '../db/transaction.js';

/** The four location ids of a ward, from ward up to province. */
export interface WardLocation {
  wardId: number;
  localLevelId: number;
  districtId: number;
  provinceId: number;
}

/**
 * Finds a ward's palika, district and province with two JOINs up the hierarchy.
 * We copy these ids onto the request at insert time (ADR-001), so the map can later count
 * per district with a simple GROUP BY instead of repeating these joins for every request.
 */
export async function findWardLocation(wardId: number): Promise<WardLocation | null> {
  const { rows } = await pool.query<WardLocation>(
    `SELECT w.id AS "wardId", l.id AS "localLevelId", l.district_id AS "districtId", d.province_id AS "provinceId"
     FROM wards w
     JOIN local_levels l ON l.id = w.local_level_id
     JOIN districts d    ON d.id = l.district_id
     WHERE w.id = $1`,
    [wardId],
  );
  return rows[0] ?? null;
}

export interface NewRequest {
  trackingCode: string;
  citizenId: string;
  input: CreateRequestInput;
  location: WardLocation;
}

export interface CreatedRequest {
  id: string;
  trackingCode: string;
  status: RequestStatus;
  submittedAt: Date;
}

/** Inserts the request inside the caller's transaction. status, version and timestamps use DB defaults. */
export async function insertRequest(client: DbClient, req: NewRequest): Promise<CreatedRequest> {
  const { rows } = await client.query<CreatedRequest>(
    `INSERT INTO service_requests
       (tracking_code, citizen_id, service_type_code, ward_id, local_level_id, district_id, province_id, purpose, applicant)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, tracking_code AS "trackingCode", status, submitted_at AS "submittedAt"`,
    [
      req.trackingCode,
      req.citizenId,
      req.input.serviceTypeCode,
      req.location.wardId,
      req.location.localLevelId,
      req.location.districtId,
      req.location.provinceId,
      req.input.purpose,
      JSON.stringify(req.input.applicant), // jsonb column: pass JSON text
    ],
  );
  return rows[0]!;
}

/** The identity check starts as PENDING; the mock ID service fills in the result later (PRD F9). */
export async function insertPendingIdentityCheck(client: DbClient, requestId: string): Promise<void> {
  await client.query(`INSERT INTO identity_checks (request_id, status) VALUES ($1, 'PENDING')`, [requestId]);
}

export interface MyRequestRow {
  id: string;
  trackingCode: string;
  serviceTypeCode: ServiceTypeCode;
  status: RequestStatus;
  wardId: number;
  submittedAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  serviceDays: number;
}

/**
 * A citizen's own requests, newest first. `WHERE citizen_id = $1` is the scope rule:
 * a citizen can only ever see rows they own. JOIN service_types for the days needed by "overdue".
 */
export async function listRequestsByCitizen(citizenId: string): Promise<MyRequestRow[]> {
  const { rows } = await pool.query<MyRequestRow>(
    `SELECT r.id, r.tracking_code AS "trackingCode", r.service_type_code AS "serviceTypeCode", r.status,
            r.ward_id AS "wardId", r.submitted_at AS "submittedAt", r.updated_at AS "updatedAt",
            r.closed_at AS "closedAt", st.service_days AS "serviceDays"
     FROM service_requests r
     JOIN service_types st ON st.code = r.service_type_code
     WHERE r.citizen_id = $1
     ORDER BY r.submitted_at DESC`,
    [citizenId],
  );
  return rows;
}
