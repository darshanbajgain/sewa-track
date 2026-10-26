import type { TrackingDto } from '@sewa/shared';
import { isOverdue } from '../domain/overdue.js';
import { isValidTrackingCode, normalizeTrackingCode } from '../domain/trackingCode.js';
import { AppError } from '../errors.js';
import { findPublicTimeline, findTrackingRow } from '../repositories/tracking.repository.js';

/**
 * Public tracking (PRD F5): anyone with the code, no login.
 *   1. Clean what the person typed ("  st-7k3q… " → "ST-7K3Q…", O→0, I/L→1).
 *   2. Wrong format → 400 before touching the database.
 *   3. Unknown code → 404 (same message for "never existed": nothing to learn from it).
 *   4. Build the response field by field: an allow-list, so nothing private can slip in.
 */
export async function getTracking(rawCode: string, now: Date = new Date()): Promise<TrackingDto> {
  const code = normalizeTrackingCode(rawCode);
  if (!isValidTrackingCode(code)) {
    throw new AppError('VALIDATION_ERROR', 'Tracking code must look like ST-XXXXXXXXXX');
  }

  const row = await findTrackingRow(code);
  if (!row) throw new AppError('NOT_FOUND', 'No request found with this tracking code');

  const timeline = await findPublicTimeline(row.requestId);

  return {
    trackingCode: row.trackingCode,
    service: { code: row.serviceCode, nameEn: row.serviceNameEn, nameNe: row.serviceNameNe },
    ward: { number: row.wardNumber },
    palika: { nameEn: row.palikaNameEn, nameNe: row.palikaNameNe },
    status: row.status,
    submittedAt: row.submittedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    overdue: isOverdue({ status: row.status, submittedAt: row.submittedAt, serviceDays: row.serviceDays }, now),
    timeline: timeline.map((e) => ({ status: e.status, at: e.at.toISOString() })),
  };
}
