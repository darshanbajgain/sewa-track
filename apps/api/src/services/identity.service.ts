import type { NidVerifyRequest } from '@sewa/shared';
import { withTransaction } from '../db/transaction.js';
import { AppError } from '../errors.js';
import type { NidClient } from '../integrations/nidClient.js';
import { logger } from '../logger.js';
import { insertEvent } from '../repositories/event.repository.js';
import { completeIdentityCheck, type IdentityCheckResult } from '../repositories/request.repository.js';

const NOTE: Record<IdentityCheckResult['status'], string> = {
  MATCH: 'ID matched',
  NO_MATCH: 'ID did not match',
  FAILED: 'ID service not available',
};

/**
 * Asks the National ID service about the applicant and stores the answer (PRD F9).
 *
 * Runs AFTER the citizen already has their tracking code: with timeouts and retries a check can take up
 * to 6.6 s, and the submission must succeed even when the ID service is down (the check is then FAILED).
 * So it never throws: every outcome, including a bug, ends as a stored result or a log line.
 *
 * The result and its audit event (IDENTITY_CHECKED, by the system) are saved in one transaction, like
 * every other change to a request. Logs carry the request id only, never the name or ID number.
 */
export async function runIdentityCheck(nid: NidClient, requestId: string, applicant: NidVerifyRequest): Promise<void> {
  let result: IdentityCheckResult;
  try {
    const answer = await nid.verify({ nid: applicant.nid, name: applicant.name });
    result = { status: answer.match ? 'MATCH' : 'NO_MATCH', attempts: answer.attempts, responseMs: answer.responseMs };
  } catch (err) {
    const attempts = err instanceof AppError && typeof err.details.attempts === 'number' ? err.details.attempts : 0;
    if (!(err instanceof AppError)) logger.error({ err, requestId }, 'Identity check crashed');
    result = { status: 'FAILED', attempts, responseMs: null };
  }

  try {
    await withTransaction(async (client) => {
      if (!(await completeIdentityCheck(client, requestId, result))) return; // already completed: nothing to do
      await insertEvent(client, { requestId, actorId: null, action: 'IDENTITY_CHECKED', note: NOTE[result.status] });
    });
    logger.info({ requestId, identityCheck: result.status, attempts: result.attempts }, 'Identity check done');
  } catch (err) {
    logger.error({ err, requestId }, 'Could not store the identity check result');
  }
}
