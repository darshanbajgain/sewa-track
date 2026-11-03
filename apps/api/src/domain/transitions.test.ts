import { REQUEST_STATUSES, ROLES, type RequestStatus, type Role } from '@sewa/shared';
import { describe, expect, it } from 'vitest';
import { TRANSITIONS, allowedTransitions, checkTransition, type RequestFacts } from './transitions.js';

/**
 * Unit tests: pure function in, answer out. No database, no HTTP, runs in milliseconds.
 * Strategy: test EVERY allowed move, EVERY forbidden pair, every wrong role, every condition.
 */

const PAID = new Date('2026-10-20T05:00:00Z');

/** A request where every condition is already satisfied, so only the rule under test matters. */
function readyRequest(status: RequestStatus, overrides: Partial<RequestFacts> = {}): RequestFacts {
  return {
    status,
    feeNpr: 500,
    feePaidAt: PAID,
    requiresFieldVerification: true,
    fieldVerifiedAt: PAID,
    openDocuments: 0,
    ...overrides,
  };
}

const WITH_TEXT = { note: 'Please bring the land certificate', reason: 'Documents do not match', documents: ['Land certificate'] };

describe('allowed transitions (PRD §6.2)', () => {
  it('has exactly the 11 moves from the PRD', () => {
    expect(TRANSITIONS).toHaveLength(11);
  });

  it.each(TRANSITIONS.map((r) => [r.from, r.to, r.actor] as const))(
    '%s → %s is allowed for %s',
    (from, to, actor) => {
      expect(checkTransition(readyRequest(from), to, actor, WITH_TEXT)).toMatchObject({ ok: true });
    },
  );
});

describe('forbidden transitions', () => {
  // Every (from, to) pair of the 8 statuses that is NOT in the table: 64 − 11 = 53 pairs.
  const allowed = new Set(TRANSITIONS.map((r) => `${r.from}->${r.to}`));
  const forbiddenPairs = REQUEST_STATUSES.flatMap((from) => REQUEST_STATUSES.map((to) => [from, to] as const)).filter(
    ([from, to]) => !allowed.has(`${from}->${to}`),
  );

  it('covers all 53 pairs not in the table', () => {
    expect(forbiddenPairs).toHaveLength(53);
  });

  it.each(forbiddenPairs)('%s → %s is INVALID_TRANSITION for every role', (from, to) => {
    for (const role of ROLES) {
      expect(checkTransition(readyRequest(from), to, role, WITH_TEXT)).toMatchObject({
        ok: false,
        code: 'INVALID_TRANSITION',
      });
    }
  });

  it('allows nothing out of a final status (ISSUED, REJECTED, CANCELLED)', () => {
    for (const status of ['ISSUED', 'REJECTED', 'CANCELLED'] as const) {
      expect(TRANSITIONS.filter((r) => r.from === status)).toEqual([]);
    }
  });
});

describe('wrong kind of user → FORBIDDEN', () => {
  // For each allowed move, every role except the right one is refused.
  const cases = TRANSITIONS.flatMap((r) =>
    ROLES.filter((role) => role !== r.actor).map((role) => [r.from, r.to, role] as const),
  );

  it.each(cases)('%s → %s by %s', (from, to, role: Role) => {
    expect(checkTransition(readyRequest(from), to, role, WITH_TEXT)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});

describe('conditions', () => {
  it('requires a note to ask for documents (blank text does not count)', () => {
    const req = readyRequest('UNDER_REVIEW');
    expect(checkTransition(req, 'NEEDS_DOCUMENTS', 'WARD_OFFICER', {})).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(checkTransition(req, 'NEEDS_DOCUMENTS', 'WARD_OFFICER', { note: '   ' })).toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('requires at least one document name to ask for documents (PRD F15)', () => {
    const req = readyRequest('UNDER_REVIEW');
    for (const documents of [undefined, []]) {
      expect(checkTransition(req, 'NEEDS_DOCUMENTS', 'WARD_OFFICER', { note: 'Please upload', documents })).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'Name at least one document to upload',
      });
    }
  });

  it('blocks resubmitting while a requested document is missing or "not OK" (PRD F15)', () => {
    const waiting = readyRequest('NEEDS_DOCUMENTS', { openDocuments: 1 });
    expect(checkTransition(waiting, 'UNDER_REVIEW', 'CITIZEN', WITH_TEXT)).toMatchObject({
      code: 'INVALID_TRANSITION',
      message: 'Upload every requested document before resubmitting',
    });
    // Cancelling is still possible, and the resubmit button is hidden.
    expect(allowedTransitions(waiting, 'CITIZEN')).toEqual(['CANCELLED']);
  });

  it('requires a note when the citizen resubmits documents', () => {
    expect(checkTransition(readyRequest('NEEDS_DOCUMENTS'), 'UNDER_REVIEW', 'CITIZEN', {})).toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('requires a reason to reject (from review and from field verification)', () => {
    for (const from of ['UNDER_REVIEW', 'FIELD_VERIFICATION'] as const) {
      expect(checkTransition(readyRequest(from), 'REJECTED', 'WARD_OFFICER', { note: 'not a reason' })).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'A reason is required to reject',
      });
    }
  });

  it('allows field verification only for services that need it', () => {
    const req = readyRequest('UNDER_REVIEW', { requiresFieldVerification: false });
    expect(checkTransition(req, 'FIELD_VERIFICATION', 'WARD_OFFICER')).toMatchObject({
      code: 'INVALID_TRANSITION',
      message: 'This service does not need field verification',
    });
  });

  it('blocks approval until a non-zero fee is paid', () => {
    const unpaid = readyRequest('UNDER_REVIEW', { feeNpr: 200, feePaidAt: null });
    expect(checkTransition(unpaid, 'APPROVED', 'WARD_OFFICER')).toMatchObject({
      code: 'INVALID_TRANSITION',
      message: 'The fee must be paid before approval',
    });
  });

  it('allows approval of a free service without payment', () => {
    const free = readyRequest('UNDER_REVIEW', { feeNpr: 0, feePaidAt: null });
    expect(checkTransition(free, 'APPROVED', 'WARD_OFFICER')).toMatchObject({ ok: true });
  });

  it('blocks approval until field verification is done, when the service needs it', () => {
    const notVisited = readyRequest('UNDER_REVIEW', { fieldVerifiedAt: null });
    expect(checkTransition(notVisited, 'APPROVED', 'WARD_OFFICER')).toMatchObject({
      code: 'INVALID_TRANSITION',
      message: 'Field verification must be completed before approval',
    });
  });

  it('does not need field verification for services without a field visit', () => {
    const noVisitNeeded = readyRequest('UNDER_REVIEW', { requiresFieldVerification: false, fieldVerifiedAt: null });
    expect(checkTransition(noVisitNeeded, 'APPROVED', 'WARD_OFFICER')).toMatchObject({ ok: true });
  });
});

describe('effects', () => {
  it('assigns the officer when review starts', () => {
    const result = checkTransition(readyRequest('SUBMITTED'), 'UNDER_REVIEW', 'WARD_OFFICER');
    expect(result).toEqual({
      ok: true,
      effects: { assignOfficerIfEmpty: true, setFieldVerifiedAt: false, setClosedAt: false, requestDocuments: false },
    });
  });

  it('creates the requested documents only when asking for documents', () => {
    expect(checkTransition(readyRequest('UNDER_REVIEW'), 'NEEDS_DOCUMENTS', 'WARD_OFFICER', WITH_TEXT)).toMatchObject({
      effects: { requestDocuments: true },
    });
    expect(checkTransition(readyRequest('UNDER_REVIEW'), 'APPROVED', 'WARD_OFFICER')).toMatchObject({
      effects: { requestDocuments: false },
    });
  });

  it('records field verification when the officer returns from the field', () => {
    const result = checkTransition(readyRequest('FIELD_VERIFICATION'), 'UNDER_REVIEW', 'WARD_OFFICER', WITH_TEXT);
    expect(result).toMatchObject({ ok: true, effects: { setFieldVerifiedAt: true, setClosedAt: false } });
  });

  it.each([
    ['APPROVED', 'ISSUED', 'WARD_OFFICER'],
    ['UNDER_REVIEW', 'REJECTED', 'WARD_OFFICER'],
    ['SUBMITTED', 'CANCELLED', 'CITIZEN'],
  ] as const)('sets closedAt for %s → %s', (from, to, actor) => {
    expect(checkTransition(readyRequest(from), to, actor, WITH_TEXT)).toMatchObject({
      ok: true,
      effects: { setClosedAt: true },
    });
  });

  it('does not close a request that is still open', () => {
    expect(checkTransition(readyRequest('UNDER_REVIEW'), 'APPROVED', 'WARD_OFFICER')).toMatchObject({
      effects: { setClosedAt: false },
    });
  });
});

describe('allowedTransitions (buttons the UI shows)', () => {
  it('officer, review of a paid non-field service: ask for documents, approve, reject', () => {
    const req = readyRequest('UNDER_REVIEW', { requiresFieldVerification: false, fieldVerifiedAt: null });
    expect(allowedTransitions(req, 'WARD_OFFICER')).toEqual(['NEEDS_DOCUMENTS', 'APPROVED', 'REJECTED']);
  });

  it('officer, unpaid field service: no Approve button yet, but field verification is offered', () => {
    const req = readyRequest('UNDER_REVIEW', { feeNpr: 500, feePaidAt: null, fieldVerifiedAt: null });
    expect(allowedTransitions(req, 'WARD_OFFICER')).toEqual(['NEEDS_DOCUMENTS', 'FIELD_VERIFICATION', 'REJECTED']);
  });

  it('citizen whose request needs documents: resubmit or cancel', () => {
    expect(allowedTransitions(readyRequest('NEEDS_DOCUMENTS'), 'CITIZEN')).toEqual(['UNDER_REVIEW', 'CANCELLED']);
  });

  it('palika and system admins never get status buttons', () => {
    for (const status of REQUEST_STATUSES) {
      expect(allowedTransitions(readyRequest(status), 'PALIKA_ADMIN')).toEqual([]);
      expect(allowedTransitions(readyRequest(status), 'SYSTEM_ADMIN')).toEqual([]);
    }
  });
});
