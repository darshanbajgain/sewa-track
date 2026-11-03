'use client';

import type { ReactNode } from 'react';
import { PortalLayout } from '@/components/auth/PortalLayout';
import { PORTAL_ROLES } from '@/lib/routing';

/** System admin portal: national overview, user management, all requests (read only), delay map. Tabs: PORTAL_TABS in lib/routing.ts. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <PortalLayout roles={PORTAL_ROLES.admin}>{children}</PortalLayout>;
}
