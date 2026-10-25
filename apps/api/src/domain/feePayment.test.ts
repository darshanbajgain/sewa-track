import { describe, expect, it } from 'vitest';
import { checkMarkFeePaid } from './feePayment.js';

const unpaid = { status: 'UNDER_REVIEW' as const, feeNpr: 200, feePaidAt: null };

describe('checkMarkFeePaid', () => {
  it.each(['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_DOCUMENTS', 'FIELD_VERIFICATION'] as const)(
    'allows a ward officer to mark the fee paid in %s',
    (status) => {
      expect(checkMarkFeePaid({ ...unpaid, status }, 'WARD_OFFICER')).toEqual({ ok: true });
    },
  );

  it.each(['CITIZEN', 'PALIKA_ADMIN', 'SYSTEM_ADMIN'] as const)('forbids %s', (role) => {
    expect(checkMarkFeePaid(unpaid, role)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('refuses for a free service', () => {
    expect(checkMarkFeePaid({ ...unpaid, feeNpr: 0 }, 'WARD_OFFICER')).toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('refuses to mark it paid twice', () => {
    expect(checkMarkFeePaid({ ...unpaid, feePaidAt: new Date() }, 'WARD_OFFICER')).toMatchObject({
      code: 'INVALID_TRANSITION',
      message: 'The fee is already marked as paid',
    });
  });

  it.each(['APPROVED', 'ISSUED', 'REJECTED', 'CANCELLED'] as const)('refuses in status %s', (status) => {
    expect(checkMarkFeePaid({ ...unpaid, status }, 'WARD_OFFICER')).toMatchObject({ code: 'INVALID_TRANSITION' });
  });
});
