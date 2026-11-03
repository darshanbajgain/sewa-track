import type { QueueItemDto, RequestDetailDto, RequestStatus } from '@sewa/shared';

/**
 * What the staff request screen shows, worked out from the request (plain functions, no React).
 *
 * This file does NOT decide what is allowed: the server sends `allowedTransitions` and `canMarkFeePaid`
 * (from domain/transitions.ts). It only arranges those moves so the officer sees ONE obvious next step,
 * the other moves next to it, and Reject set apart.
 */

export type StaffAction = { kind: 'status'; to: RequestStatus } | { kind: 'fee' };

// ---------- Progress bar ----------

export type StepState = 'done' | 'current' | 'todo' | 'stopped';
export interface ProgressStep {
  status: RequestStatus; // which step (its name is the status name)
  state: StepState;
  note?: RequestStatus; // shown under the name: "Needs documents" while waiting, "Rejected"/"Cancelled" where it stopped
}

/** Position on the normal path. The field visit happens during the review, so it sits between review and approval. */
const RANK: Partial<Record<RequestStatus, number>> = { SUBMITTED: 0, UNDER_REVIEW: 1, FIELD_VERIFICATION: 1.5, APPROVED: 2, ISSUED: 3 };

/**
 * Steps of the normal path: Submitted → Under review → (Field verification, only if the service needs it)
 * → Approved → Issued. "Needs documents" is shown as a pause on the review step. A rejected or cancelled
 * request shows where it stopped: the status it left, read from the history.
 */
export function progressSteps(request: Pick<RequestDetailDto, 'status' | 'fieldVerifiedAt' | 'service' | 'events'>): ProgressStep[] {
  const ended = request.status === 'REJECTED' || request.status === 'CANCELLED';
  // Where are we on the path? For an ended request: the status it was in just before (a request ends
  // only once, so there is exactly one history row that moved it to REJECTED/CANCELLED).
  let at = request.status;
  if (ended) at = request.events.find((e) => e.toStatus === request.status)?.fromStatus ?? 'SUBMITTED';
  if (at === 'NEEDS_DOCUMENTS') at = 'UNDER_REVIEW';
  const atRank = RANK[at] ?? 0;

  const path: RequestStatus[] = ['SUBMITTED', 'UNDER_REVIEW'];
  if (request.service.requiresFieldVerification) path.push('FIELD_VERIFICATION');
  path.push('APPROVED', 'ISSUED');

  return path.map((status): ProgressStep => {
    if (status === at) {
      if (ended) return { status, state: 'stopped', note: request.status };
      if (status === 'ISSUED') return { status, state: 'done' }; // the last step: nothing left to do
      return { status, state: 'current', note: request.status === 'NEEDS_DOCUMENTS' ? 'NEEDS_DOCUMENTS' : undefined };
    }
    // The field visit can be finished while the request is back under review, so ask the request, not the rank.
    if (status === 'FIELD_VERIFICATION') return { status, state: request.fieldVerifiedAt || atRank >= 2 ? 'done' : 'todo' };
    return { status, state: RANK[status]! < atRank ? 'done' : 'todo' };
  });
}

// ---------- "Next step" card ----------

/** Text keys for the one-sentence explanation (see messages/en.json "staff.hint.*"). */
export type HintKey = 'SUBMITTED' | 'fee' | 'field' | 'approve' | 'FIELD_VERIFICATION' | 'NEEDS_DOCUMENTS' | 'APPROVED';

export interface NextStep {
  hint: HintKey;
  primary: StaffAction | null; // the big button
  others: StaffAction[]; // other moves that are allowed now
  reject: StaffAction | null; // kept apart, it closes the request
  approveBlockedBy: 'fee' | 'field' | null; // Approve shown disabled, with this reason
}

type NextStepInput = Pick<RequestDetailDto, 'status' | 'allowedTransitions' | 'canMarkFeePaid' | 'feePaidAt' | 'fieldVerifiedAt' | 'service'>;

/** Returns null when this user can't change the request (closed, or a read-only role). */
export function nextStep(request: NextStepInput): NextStep | null {
  const allowed = request.allowedTransitions;
  if (allowed.length === 0 && !request.canMarkFeePaid) return null;

  const move = (to: RequestStatus): StaffAction | null => (allowed.includes(to) ? { kind: 'status', to } : null);
  const fee: StaffAction | null = request.canMarkFeePaid ? { kind: 'fee' } : null;

  let hint: HintKey;
  let primary: StaffAction | null;
  let approveBlockedBy: NextStep['approveBlockedBy'] = null;

  switch (request.status) {
    case 'UNDER_REVIEW':
      // Suggested order: fee → field visit (if needed) → approve. The server allows approve only when both are done.
      if (fee) {
        hint = 'fee';
        primary = fee;
      } else if (request.service.requiresFieldVerification && !request.fieldVerifiedAt) {
        hint = 'field';
        primary = move('FIELD_VERIFICATION');
      } else {
        hint = 'approve';
        primary = move('APPROVED');
      }
      if (!allowed.includes('APPROVED')) {
        approveBlockedBy = request.service.feeNpr > 0 && !request.feePaidAt ? 'fee' : 'field';
      }
      break;
    case 'SUBMITTED':
      hint = 'SUBMITTED';
      primary = move('UNDER_REVIEW');
      break;
    case 'FIELD_VERIFICATION':
      hint = 'FIELD_VERIFICATION';
      primary = move('UNDER_REVIEW'); // "Field visit done"
      break;
    case 'APPROVED':
      hint = 'APPROVED';
      primary = move('ISSUED');
      break;
    default:
      // NEEDS_DOCUMENTS: the citizen acts next; the officer may still record the fee.
      hint = 'NEEDS_DOCUMENTS';
      primary = null;
  }

  const same = (a: StaffAction, b: StaffAction | null) => b !== null && a.kind === b.kind && (a.kind === 'fee' || (b.kind === 'status' && a.to === b.to));
  const others: StaffAction[] = allowed
    .filter((to) => to !== 'REJECTED')
    .map((to): StaffAction => ({ kind: 'status', to }))
    .filter((a) => !same(a, primary));
  if (fee && !same(fee, primary)) others.push(fee);

  return { hint, primary, others, reject: move('REJECTED'), approveBlockedBy };
}

// ---------- Queue ----------

/** Short "what happens next" text key for a queue row (by status only; the detail page has the full picture). */
export const queueNextKey = (status: QueueItemDto['status']) => `staff.queueNext.${status}` as const;
