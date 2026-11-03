import type { LoginPortal, Role } from '@sewa/shared';

/**
 * One portal per role (decided 2026-11-01): where each role lands after login, and who may open each portal.
 * Changing a landing page is a one-line change here. See docs/frontend.md §7.
 */
export const ROLE_HOME: Record<Role, string> = {
  CITIZEN: '/citizen',
  WARD_OFFICER: '/ward',
  PALIKA_ADMIN: '/palika',
  SYSTEM_ADMIN: '/admin',
};

export const PORTAL_ROLES = {
  citizen: ['CITIZEN'],
  ward: ['WARD_OFFICER'],
  palika: ['PALIKA_ADMIN'],
  admin: ['SYSTEM_ADMIN'],
} as const satisfies Record<string, readonly Role[]>;

/** The main-menu label for each role's portal. */
export const PORTAL_NAV_KEY = {
  CITIZEN: 'nav.myRequests',
  WARD_OFFICER: 'nav.wardPortal',
  PALIKA_ADMIN: 'nav.palikaPortal',
  SYSTEM_ADMIN: 'nav.adminPortal',
} as const satisfies Record<Role, string>;

/**
 * Only allow redirects to OUR pages after login. `/login?next=https://evil.example` must not send the
 * user to another site ("open redirect", used in phishing). Accept only a single leading "/" path:
 * reject "//evil.example" (protocol-relative) and backslash tricks.
 */
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  return next;
}

/** Citizens and staff log in on separate pages (PRD F3); the API also refuses an account on the wrong one. */
export const LOGIN_PATH: Record<LoginPortal, string> = {
  CITIZEN: '/login',
  STAFF: '/staff/login',
};

export const isLoginPath = (path: string) => path === LOGIN_PATH.CITIZEN || path === LOGIN_PATH.STAFF;

/** The staff portals send people to the staff login; everything else to the citizen login. */
export function loginPathFor(path: string): string {
  return /^\/(ward|palika|admin)(\/|$)/.test(path) ? LOGIN_PATH.STAFF : LOGIN_PATH.CITIZEN;
}

/** "/login?next=…&reason=…" (or /staff/login) for the current page. */
export function loginUrl(currentPath: string, reason?: 'expired' | 'required'): string {
  const params = new URLSearchParams({ next: currentPath });
  if (reason) params.set('reason', reason);
  return `${loginPathFor(currentPath)}?${params}`;
}
