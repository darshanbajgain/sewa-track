import type { ChangeResultDto, TransitionBody } from '@sewa/shared';
import { withTransaction } from '../db/transaction.js';
import { canViewRequest } from '../domain/access.js';
import { checkMarkFeePaid } from '../domain/feePayment.js';
import { checkTransition } from '../domain/transitions.js';
import { AppError } from '../errors.js';
import type { Notifier } from '../integrations/notifier.js';
import { logger } from '../logger.js';
import { findChangeFacts, markFeePaidWithVersion, updateStatusWithVersion } from '../repositories/change.repository.js';
import { insertEvent } from '../repositories/event.repository.js';
import type { SessionUser } from '../security/token.js';
import { requestDocumentsInTransaction } from './document.service.js';

const CONFLICT_MESSAGE = 'This request was updated by someone else. Reload to see the latest.';

/**
 * Change a request's status (PRD §6, F6). The checks, in order, and what each returns:
 *
 *   1. request exists?                                   no → 404 NOT_FOUND
 *   2. in the user's scope (own ward / own request)?     no → 403 FORBIDDEN
 *   3. user's version = current version?                 no → 409 CONFLICT   (fast path)
 *   4. domain rule: allowed move, right role, conditions? no → 422 / 403 / 400
 *   5. ONE transaction:
 *        UPDATE ... WHERE id AND version   (0 rows → someone was faster → ROLLBACK → 409)
 *        asking for documents? → create a REQUESTED slot per named document (PRD F15)
 *        INSERT audit event STATUS_CHANGED
 *      COMMIT: both saved, or neither (AGENTS §6)
 *   6. AFTER commit: notify the citizen. A failed notification must not undo a saved change,
 *      and nothing slow (like sending a message) should run while the transaction is open.
 */
export async function changeStatus(
  user: SessionUser,
  id: string,
  body: TransitionBody,
  notifier: Notifier,
): Promise<ChangeResultDto> {
  const facts = await findChangeFacts(id);
  if (!facts) throw new AppError('NOT_FOUND', 'Request not found');

  if (!canViewRequest(user, facts)) {
    throw new AppError('FORBIDDEN', 'This request is outside your ward or not yours');
  }

  // Fast path: the user is looking at an old copy. (Step 5 still guards the race in between.)
  if (body.version !== facts.version) throw new AppError('CONFLICT', CONFLICT_MESSAGE);

  const decision = checkTransition(facts, body.toStatus, user.role, {
    note: body.note,
    reason: body.reason,
    documents: body.documents,
  });
  if (!decision.ok) throw new AppError(decision.code, decision.message);

  const result = await withTransaction(async (client) => {
    const updated = await updateStatusWithVersion(client, {
      id,
      expectedVersion: body.version,
      toStatus: body.toStatus,
      assignOfficerId: decision.effects.assignOfficerIfEmpty ? user.id : null,
      setFieldVerifiedAt: decision.effects.setFieldVerifiedAt,
      setClosedAt: decision.effects.setClosedAt,
    });
    // Throwing inside withTransaction → ROLLBACK, then the error handler sends 409.
    if (!updated) throw new AppError('CONFLICT', CONFLICT_MESSAGE);

    if (decision.effects.requestDocuments) {
      await requestDocumentsInTransaction(client, id, body.documents ?? [], user.id);
    }

    await insertEvent(client, {
      requestId: id,
      actorId: user.id,
      action: 'STATUS_CHANGED',
      fromStatus: facts.status,
      toStatus: body.toStatus,
      note: body.reason ?? body.note ?? null, // rejections store the reason; other moves the note
    });
    return updated;
  });

  try {
    await notifier.statusChanged({ trackingCode: facts.trackingCode, fromStatus: facts.status, toStatus: result.status });
  } catch (err) {
    logger.warn({ err, requestId: id }, 'Notification failed; status change is already saved');
  }

  return { id, status: result.status, version: result.version };
}

/** Mark the fee as paid (PRD F6): same pattern, audited as FEE_PAID. The status doesn't change. */
export async function markFeePaid(user: SessionUser, id: string, version: number): Promise<ChangeResultDto> {
  const facts = await findChangeFacts(id);
  if (!facts) throw new AppError('NOT_FOUND', 'Request not found');
  if (!canViewRequest(user, facts)) throw new AppError('FORBIDDEN', 'This request is outside your ward');
  if (version !== facts.version) throw new AppError('CONFLICT', CONFLICT_MESSAGE);

  const decision = checkMarkFeePaid(facts, user.role);
  if (!decision.ok) throw new AppError(decision.code, decision.message);

  const result = await withTransaction(async (client) => {
    const updated = await markFeePaidWithVersion(client, id, version);
    if (!updated) throw new AppError('CONFLICT', CONFLICT_MESSAGE);
    await insertEvent(client, { requestId: id, actorId: user.id, action: 'FEE_PAID' });
    return updated;
  });

  return { id, status: result.status, version: result.version };
}
