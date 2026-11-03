import type { LoginPortal, Role } from '@sewa/shared';
import type { MessageKey } from './i18n';

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

/** Helpers for a tab's `matches`: the exact page, or the page plus everything under a sub-path. */
export const exactly = (path: string) => (p: string) => p === path;
export const under = (...paths: string[]) => (p: string) => paths.some((path) => p === path || p.startsWith(`${path}/`));

export interface PortalTab {
  href: string;
  key: MessageKey;
  /** Which URLs count as "this tab" (e.g. a request's detail page belongs to the queue tab). */
  matches: (pathname: string) => boolean;
}

/**
 * The main menu once logged in (decided 2026-11-03): only the pages that role needs. Public pages
 * (home, services, track, map) are for visitors; a logged-in user is sent to their portal instead
 * (app/(public)/layout.tsx). Staff who need the map get it as a tab here.
 */
export const PORTAL_TABS: Record<Role, PortalTab[]> = {
  CITIZEN: [
    { href: '/citizen', key: 'nav.myRequests', matches: (p) => p === '/citizen' || under('/citizen/requests')(p) },
    { href: '/citizen/apply', key: 'nav.apply', matches: under('/citizen/apply') },
  ],
  WARD_OFFICER: [{ href: '/ward', key: 'staff.queue', matches: (p) => p === '/ward' || under('/ward/requests')(p) }],
  PALIKA_ADMIN: [
    { href: '/palika', key: 'staff.queue', matches: (p) => p === '/palika' || under('/palika/requests')(p) },
    { href: '/palika/reports', key: 'staff.reports', matches: under('/palika/reports') },
    { href: '/palika/map', key: 'nav.map', matches: under('/palika/map') },
  ],
  SYSTEM_ADMIN: [
    { href: '/admin', key: 'admin.overview', matches: exactly('/admin') },
    { href: '/admin/users', key: 'admin.users', matches: under('/admin/users') },
    { href: '/admin/requests', key: 'staff.queue', matches: under('/admin/requests') },
    { href: '/admin/map', key: 'nav.map', matches: under('/admin/map') },
  ],
};

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
