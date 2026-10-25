import type { RequestStatus, Role } from '@sewa/shared';
import { isTerminal } from './overdue.js';

/**
 * THE workflow of a service request (PRD §6.2). The only place these rules exist (AGENTS §6).
 *
 * Split of responsibilities:
 *   - This file (pure, no DB): "Is this move allowed for this kind of user, and are its
 *     conditions met? If yes, what else must change?"
 *   - The service (P5): loads the request, checks SCOPE (own ward / own request → else 403),
 *     calls this function, then writes the update + audit row in one transaction.
 */

/** Something the request or the input must satisfy for a move to be allowed. */
type Condition =
  | 'NOTE' // a non-empty note is required (e.g. what documents are missing)
  | 'REASON' // a non-empty reason is required (rejections)
  | 'FIELD_SERVICE' // only for service types that need a field visit
  | 'FEE_PAID' // fee paid, unless the service is free
  | 'FIELD_VERIFIED'; // field visit done, if the service needs one

/** Extra changes the service must make together with the status change. */
export interface TransitionEffects {
  assignOfficerIfEmpty: boolean; // first officer to start the review becomes the assigned officer
  setFieldVerifiedAt: boolean; // field visit finished
  setClosedAt: boolean; // reached a final status
}

interface TransitionRule {
  from: RequestStatus;
  to: RequestStatus;
  actor: Extract<Role, 'CITIZEN' | 'WARD_OFFICER'>;
  conditions: Condition[];
}

/** PRD §6.2, row by row. Anything not listed here is not allowed. */
export const TRANSITIONS: readonly TransitionRule[] = [
  { from: 'SUBMITTED', to: 'UNDER_REVIEW', actor: 'WARD_OFFICER', conditions: [] },
  { from: 'SUBMITTED', to: 'CANCELLED', actor: 'CITIZEN', conditions: [] },
  { from: 'UNDER_REVIEW', to: 'NEEDS_DOCUMENTS', actor: 'WARD_OFFICER', conditions: ['NOTE'] },
  { from: 'NEEDS_DOCUMENTS', to: 'UNDER_REVIEW', actor: 'CITIZEN', conditions: ['NOTE'] },
  { from: 'NEEDS_DOCUMENTS', to: 'CANCELLED', actor: 'CITIZEN', conditions: [] },
  { from: 'UNDER_REVIEW', to: 'FIELD_VERIFICATION', actor: 'WARD_OFFICER', conditions: ['FIELD_SERVICE'] },
  { from: 'FIELD_VERIFICATION', to: 'UNDER_REVIEW', actor: 'WARD_OFFICER', conditions: ['NOTE'] },
  { from: 'UNDER_REVIEW', to: 'APPROVED', actor: 'WARD_OFFICER', conditions: ['FEE_PAID', 'FIELD_VERIFIED'] },
  { from: 'UNDER_REVIEW', to: 'REJECTED', actor: 'WARD_OFFICER', conditions: ['REASON'] },
  { from: 'FIELD_VERIFICATION', to: 'REJECTED', actor: 'WARD_OFFICER', conditions: ['REASON'] },
  { from: 'APPROVED', to: 'ISSUED', actor: 'WARD_OFFICER', conditions: [] },
];

/** What the function needs to know about the request. */
export interface RequestFacts {
  status: RequestStatus;
  feeNpr: number;
  feePaidAt: Date | null;
  requiresFieldVerification: boolean;
  fieldVerifiedAt: Date | null;
}

/** What the user sent with the request to change status. */
export interface TransitionInput {
  note?: string | undefined;
  reason?: string | undefined;
}

/**
 * The answer: either allowed (with effects), or refused with an error code the API maps to HTTP:
 *   FORBIDDEN 403          → the move exists, but this kind of user can't make it
 *   INVALID_TRANSITION 422 → the move doesn't exist, or the request isn't ready for it
 *   VALIDATION_ERROR 400   → the user forgot a required note or reason
 *
 * This shape is a "discriminated union": checking `result.ok` tells TypeScript which fields exist.
 */
export type TransitionResult =
  | { ok: true; effects: TransitionEffects }
  | { ok: false; code: 'FORBIDDEN' | 'INVALID_TRANSITION' | 'VALIDATION_ERROR'; message: string };

const isBlank = (text: string | undefined) => text === undefined || text.trim() === '';

/** Checks one condition. Returns an error result, or null if the condition is met. */
function checkCondition(condition: Condition, request: RequestFacts, input: TransitionInput): TransitionResult | null {
  switch (condition) {
    case 'NOTE':
      return isBlank(input.note) ? { ok: false, code: 'VALIDATION_ERROR', message: 'A note is required for this step' } : null;
    case 'REASON':
      return isBlank(input.reason) ? { ok: false, code: 'VALIDATION_ERROR', message: 'A reason is required to reject' } : null;
    case 'FIELD_SERVICE':
      return request.requiresFieldVerification
        ? null
        : { ok: false, code: 'INVALID_TRANSITION', message: 'This service does not need field verification' };
    case 'FEE_PAID':
      return request.feeNpr > 0 && request.feePaidAt === null
        ? { ok: false, code: 'INVALID_TRANSITION', message: 'The fee must be paid before approval' }
        : null;
    case 'FIELD_VERIFIED':
      return request.requiresFieldVerification && request.fieldVerifiedAt === null
        ? { ok: false, code: 'INVALID_TRANSITION', message: 'Field verification must be completed before approval' }
        : null;
  }
}

/**
 * Decides whether `actorRole` may move `request` to `to`.
 * Order of checks: does the move exist → right kind of user → conditions met.
 */
export function checkTransition(
  request: RequestFacts,
  to: RequestStatus,
  actorRole: Role,
  input: TransitionInput = {},
): TransitionResult {
  const rule = TRANSITIONS.find((r) => r.from === request.status && r.to === to);
  if (!rule) {
    return { ok: false, code: 'INVALID_TRANSITION', message: `Cannot move from ${request.status} to ${to}` };
  }

  if (rule.actor !== actorRole) {
    return { ok: false, code: 'FORBIDDEN', message: `Only a ${rule.actor} can move a request from ${request.status} to ${to}` };
  }

  for (const condition of rule.conditions) {
    const failure = checkCondition(condition, request, input);
    if (failure) return failure;
  }

  return {
    ok: true,
    effects: {
      assignOfficerIfEmpty: rule.from === 'SUBMITTED' && rule.to === 'UNDER_REVIEW',
      setFieldVerifiedAt: rule.from === 'FIELD_VERIFICATION' && rule.to === 'UNDER_REVIEW',
      setClosedAt: isTerminal(rule.to),
    },
  };
}

/**
 * The moves this user could make right now, for the UI's buttons ("show only valid actions", PRD F6).
 * A required note/reason is not checked here: the UI asks for it when the button is clicked.
 */
export function allowedTransitions(request: RequestFacts, actorRole: Role): RequestStatus[] {
  const placeholderText = { note: 'x', reason: 'x' };
  return TRANSITIONS.filter((r) => r.from === request.status)
    .filter((r) => checkTransition(request, r.to, actorRole, placeholderText).ok)
    .map((r) => r.to);
}
