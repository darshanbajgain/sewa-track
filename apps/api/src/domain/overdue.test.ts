import { describe, expect, it } from 'vitest';
import { closedOnTime, dueAt, isOverdue, isTerminal } from './overdue.js';

// All times in UTC. Submitted Monday 10:00 UTC; a 1-day service is due Tuesday 10:00 UTC.
const SUBMITTED = new Date('2026-10-19T10:00:00Z');
const at = (iso: string) => new Date(iso);

describe('dueAt', () => {
  it('adds the service days as 24-hour periods', () => {
    expect(dueAt(SUBMITTED, 1)).toEqual(at('2026-10-20T10:00:00Z'));
    expect(dueAt(SUBMITTED, 3)).toEqual(at('2026-10-22T10:00:00Z'));
  });
});

describe('isOverdue', () => {
  const open = { status: 'UNDER_REVIEW' as const, submittedAt: SUBMITTED, serviceDays: 1 };

  it('is false before the due time', () => {
    expect(isOverdue(open, at('2026-10-20T09:59:59Z'))).toBe(false);
  });

  it('is false exactly at the due time (the promise is still kept)', () => {
    expect(isOverdue(open, at('2026-10-20T10:00:00Z'))).toBe(false);
  });

  it('is true one second after the due time', () => {
    expect(isOverdue(open, at('2026-10-20T10:00:01Z'))).toBe(true);
  });

  it.each(['ISSUED', 'REJECTED', 'CANCELLED'] as const)('is never true for a finished request (%s)', (status) => {
    expect(isOverdue({ ...open, status }, at('2027-01-01T00:00:00Z'))).toBe(false);
  });

  it('counts NEEDS_DOCUMENTS as still open (the clock keeps running in v1)', () => {
    expect(isOverdue({ ...open, status: 'NEEDS_DOCUMENTS' }, at('2026-10-25T00:00:00Z'))).toBe(true);
  });
});

describe('closedOnTime', () => {
  it('is true when closed before or exactly at the due time', () => {
    expect(closedOnTime({ submittedAt: SUBMITTED, serviceDays: 1, closedAt: at('2026-10-19T15:00:00Z') })).toBe(true);
    expect(closedOnTime({ submittedAt: SUBMITTED, serviceDays: 1, closedAt: at('2026-10-20T10:00:00Z') })).toBe(true);
  });

  it('is false when closed after the due time', () => {
    expect(closedOnTime({ submittedAt: SUBMITTED, serviceDays: 1, closedAt: at('2026-10-21T09:00:00Z') })).toBe(false);
  });
});

describe('isTerminal', () => {
  it('is true only for ISSUED, REJECTED, CANCELLED', () => {
    expect(['ISSUED', 'REJECTED', 'CANCELLED'].every((s) => isTerminal(s as never))).toBe(true);
    expect(['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_DOCUMENTS', 'FIELD_VERIFICATION', 'APPROVED'].some((s) => isTerminal(s as never))).toBe(
      false,
    );
  });
});
