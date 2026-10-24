import { TERMINAL_STATUSES, type RequestStatus } from '@sewa/shared';

/**
 * Service-delay rules (PRD R4, F8). These power the headline feature: the national delay map.
 *
 * v1 counts CALENDAR days (24-hour periods from submission). Working days with public holidays
 * is a documented next step (PRD §19).
 *
 * `now` is always passed in, never read inside (no `new Date()` here). That keeps these functions
 * pure: the same input always gives the same answer, so tests don't need fake clocks.
 *
 * IMPORTANT: the map statistics compute the same rule in SQL
 *   (status NOT IN final AND now() > submitted_at + service_days * interval '1 day').
 * If this rule changes, change the SQL too; tests cover both.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const TERMINAL: ReadonlySet<RequestStatus> = new Set(TERMINAL_STATUSES);

/** True for ISSUED, REJECTED, CANCELLED: the request is finished. */
export function isTerminal(status: RequestStatus): boolean {
  return TERMINAL.has(status);
}

/** The moment the citizen charter promises the request will be done. */
export function dueAt(submittedAt: Date, serviceDays: number): Date {
  return new Date(submittedAt.getTime() + serviceDays * DAY_MS);
}

/**
 * Overdue = still open AND past the promised time.
 * A finished request is never overdue (even if it finished late; that's "not on time", below).
 */
export function isOverdue(
  request: { status: RequestStatus; submittedAt: Date; serviceDays: number },
  now: Date,
): boolean {
  if (isTerminal(request.status)) return false;
  return now.getTime() > dueAt(request.submittedAt, request.serviceDays).getTime();
}

/**
 * Was a finished request closed within the promised time? Used for the "on-time rate":
 *   on-time rate = closed on time ÷ all closed.
 * Exactly at the due moment still counts as on time.
 */
export function closedOnTime(request: { submittedAt: Date; closedAt: Date; serviceDays: number }): boolean {
  return request.closedAt.getTime() <= dueAt(request.submittedAt, request.serviceDays).getTime();
}
