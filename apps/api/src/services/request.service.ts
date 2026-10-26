import type { CreateRequestInput, MyRequestDto } from '@sewa/shared';
import { withTransaction } from '../db/transaction.js';
import { isOverdue } from '../domain/overdue.js';
import { generateTrackingCode } from '../domain/trackingCode.js';
import { AppError } from '../errors.js';
import { insertEvent } from '../repositories/event.repository.js';
import {
  findWardLocation,
  insertPendingIdentityCheck,
  insertRequest,
  listRequestsByCitizen,
  type CreatedRequest,
} from '../repositories/request.repository.js';
import type { SessionUser } from '../security/token.js';

const MAX_CODE_ATTEMPTS = 3;

/** Postgres error 23505 = "unique violation". We check WHICH unique constraint failed. */
function isTrackingCodeClash(err: unknown): boolean {
  const pgErr = err as { code?: string; constraint?: string };
  return pgErr.code === '23505' && pgErr.constraint === 'service_requests_tracking_code_key';
}

/**
 * Citizen submits a request (PRD F4).
 *
 *   1. Find the ward's palika, district and province (404 if the ward doesn't exist).
 *   2. In ONE transaction:
 *        a. insert the request with a new random tracking code and the copied location ids
 *        b. insert the audit event CREATED                (AGENTS §6: audit in the same transaction)
 *        c. insert the identity check as PENDING          (the mock ID service fills it in later)
 *      If any of a/b/c fails, NOTHING is saved.
 *   3. Tracking codes are random, so two could clash (about 1 in 10^15). The UNIQUE constraint
 *      catches it; we simply retry the whole transaction with a new code.
 */
export async function submitRequest(user: SessionUser, input: CreateRequestInput): Promise<CreatedRequest> {
  const location = await findWardLocation(input.wardId);
  if (!location) throw new AppError('NOT_FOUND', 'Ward not found');

  for (let attempt = 1; ; attempt++) {
    try {
      return await withTransaction(async (client) => {
        const created = await insertRequest(client, {
          trackingCode: generateTrackingCode(),
          citizenId: user.id,
          input,
          location,
        });
        await insertEvent(client, {
          requestId: created.id,
          actorId: user.id,
          action: 'CREATED',
          toStatus: created.status,
        });
        await insertPendingIdentityCheck(client, created.id);
        return created;
      });
    } catch (err) {
      if (isTrackingCodeClash(err) && attempt < MAX_CODE_ATTEMPTS) continue; // new code, new transaction
      throw err;
    }
  }
}

/** "My requests" for the logged-in citizen, with the overdue flag from the domain rule. */
export async function listMyRequests(user: SessionUser, now: Date = new Date()): Promise<MyRequestDto[]> {
  const rows = await listRequestsByCitizen(user.id);
  return rows.map((r) => ({
    id: r.id,
    trackingCode: r.trackingCode,
    serviceTypeCode: r.serviceTypeCode,
    status: r.status,
    wardId: r.wardId,
    submittedAt: r.submittedAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    closedAt: r.closedAt ? r.closedAt.toISOString() : null,
    overdue: isOverdue({ status: r.status, submittedAt: r.submittedAt, serviceDays: r.serviceDays }, now),
  }));
}
