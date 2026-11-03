'use client';

import type { Role } from '@sewa/shared';
import type { ReactNode } from 'react';
import { RequireRole } from '@/components/auth/RequireRole';

/**
 * The frame of every logged-in portal (/citizen, /ward, /palika, /admin): the role guard.
 * The portal's tabs are the main menu now (PORTAL_TABS in lib/routing.ts, drawn by SiteHeader), so each
 * portal's layout.tsx only says WHO may enter.
 *
 * Three layers protect a portal: proxy.ts (no cookie → login) → RequireRole here (wrong role → "no
 * access") → the API, the real security (every endpoint checks role and scope again).
 */
export function PortalLayout({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  return <RequireRole roles={roles}>{children}</RequireRole>;
}
