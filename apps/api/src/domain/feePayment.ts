import type { RequestStatus, Role } from '@sewa/shared';

/**
 * "Mark fee paid" (PRD F6): a ward officer records that the citizen paid at the office.
 * Not a status change, but it is audited the same way (FEE_PAID event, same transaction).
 *
 * Allowed only while the request is still being worked on, before approval: approval itself
 * requires the fee to be paid (see transitions.ts).
 */
const PAYABLE_STATUSES: ReadonlySet<RequestStatus> = new Set([
  'SUBMITTED',
  'UNDER_REVIEW',
  'NEEDS_DOCUMENTS',
  'FIELD_VERIFICATION',
]);

export type FeePaymentResult =
  | { ok: true }
  | { ok: false; code: 'FORBIDDEN' | 'INVALID_TRANSITION'; message: string };

export function checkMarkFeePaid(
  request: { status: RequestStatus; feeNpr: number; feePaidAt: Date | null },
  actorRole: Role,
): FeePaymentResult {
  if (actorRole !== 'WARD_OFFICER') {
    return { ok: false, code: 'FORBIDDEN', message: 'Only a ward officer can mark a fee as paid' };
  }
  if (request.feeNpr === 0) {
    return { ok: false, code: 'INVALID_TRANSITION', message: 'This service has no fee' };
  }
  if (request.feePaidAt !== null) {
    return { ok: false, code: 'INVALID_TRANSITION', message: 'The fee is already marked as paid' };
  }
  if (!PAYABLE_STATUSES.has(request.status)) {
    return { ok: false, code: 'INVALID_TRANSITION', message: `A fee cannot be marked as paid in status ${request.status}` };
  }
  return { ok: true };
}
