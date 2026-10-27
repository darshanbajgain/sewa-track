import type { Role } from '@sewa/shared';

/**
 * Where each role lands after login, and which roles may open each portal.
 * The portals (/citizen, /staff) are built in P7.2–P7.3; until then everyone lands on the home page.
 * Changing the landing pages is a one-line change here. See docs/frontend.md §7.
 */
export const ROLE_HOME: Record<Role, string> = {
  CITIZEN: '/', // → '/citizen' once the citizen portal exists
  WARD_OFFICER: '/', // → '/staff'
  PALIKA_ADMIN: '/', // → '/staff'
  SYSTEM_ADMIN: '/', // → '/staff/map'
};

export const PORTAL_ROLES = {
  citizen: ['CITIZEN'],
  staff: ['WARD_OFFICER', 'PALIKA_ADMIN', 'SYSTEM_ADMIN'],
} as const satisfies Record<string, readonly Role[]>;

/**
 * Only allow redirects to OUR pages after login. `/login?next=https://evil.example` must not send the
 * user to another site ("open redirect", used in phishing). Accept only a single leading "/" path:
 * reject "//evil.example" (protocol-relative) and backslash tricks.
 */
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  return next;
}

/** "/login?next=…&reason=…" for the current page. */
export function loginUrl(currentPath: string, reason?: 'expired' | 'required'): string {
  const params = new URLSearchParams({ next: currentPath });
  if (reason) params.set('reason', reason);
  return `/login?${params}`;
}
