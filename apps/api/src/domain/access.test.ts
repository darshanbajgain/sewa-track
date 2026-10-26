import { describe, expect, it } from 'vitest';
import { canViewRequest, queueScope, type Viewer } from './access.js';

const request = { citizenId: 'citizen-1', wardId: 10, localLevelId: 307 };

const viewer = (role: Viewer['role'], extra: Partial<Viewer> = {}): Viewer => ({
  id: 'someone',
  role,
  wardId: null,
  localLevelId: null,
  ...extra,
});

describe('canViewRequest', () => {
  it('lets a citizen see only their own request', () => {
    expect(canViewRequest(viewer('CITIZEN', { id: 'citizen-1' }), request)).toBe(true);
    expect(canViewRequest(viewer('CITIZEN', { id: 'citizen-2' }), request)).toBe(false);
  });

  it("lets a ward officer see only their ward's requests", () => {
    expect(canViewRequest(viewer('WARD_OFFICER', { wardId: 10 }), request)).toBe(true);
    expect(canViewRequest(viewer('WARD_OFFICER', { wardId: 11 }), request)).toBe(false);
    expect(canViewRequest(viewer('WARD_OFFICER', { wardId: null }), request)).toBe(false); // broken account: deny
  });

  it("lets a palika admin see every ward of their palika, and nothing outside it", () => {
    expect(canViewRequest(viewer('PALIKA_ADMIN', { localLevelId: 307 }), request)).toBe(true);
    expect(canViewRequest(viewer('PALIKA_ADMIN', { localLevelId: 308 }), request)).toBe(false);
  });

  it('lets a system admin see everything', () => {
    expect(canViewRequest(viewer('SYSTEM_ADMIN'), request)).toBe(true);
  });
});

describe('queueScope', () => {
  it('restricts officers to their ward, palika admins to their palika, system admins to nothing', () => {
    expect(queueScope(viewer('WARD_OFFICER', { wardId: 10 }))).toEqual({ wardId: 10, localLevelId: null });
    expect(queueScope(viewer('PALIKA_ADMIN', { localLevelId: 307 }))).toEqual({ wardId: null, localLevelId: 307 });
    expect(queueScope(viewer('SYSTEM_ADMIN'))).toEqual({ wardId: null, localLevelId: null });
  });

  it('refuses citizens (they use "my requests")', () => {
    expect(() => queueScope(viewer('CITIZEN'))).toThrow();
  });
});
