'use client';

import type { ReactNode } from 'react';
import { PortalLayout } from '@/components/auth/PortalLayout';
import { PORTAL_ROLES } from '@/lib/routing';

/** Citizen portal: my requests (and their detail pages), apply. Tabs: PORTAL_TABS in lib/routing.ts. */
export default function CitizenLayout({ children }: { children: ReactNode }) {
  return <PortalLayout roles={PORTAL_ROLES.citizen}>{children}</PortalLayout>;
}
