import type { ServiceTypeDto } from '@sewa/shared';
import { pool } from '../db/pool.js';

/** All 5 service types, in a stable order. `AS "camelCase"` maps DB columns to the API's field names. */
export async function listServiceTypes(): Promise<ServiceTypeDto[]> {
  const { rows } = await pool.query<ServiceTypeDto>(
    `SELECT code,
            name_en                     AS "nameEn",
            name_ne                     AS "nameNe",
            fee_npr                     AS "feeNpr",
            service_days                AS "serviceDays",
            requires_field_verification AS "requiresFieldVerification",
            required_documents          AS "requiredDocuments"
     FROM service_types
     ORDER BY name_en`,
  );
  return rows; // pg turns the jsonb column into a real JS array automatically
}
