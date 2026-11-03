'use client';

import type { ReactNode } from 'react';
import { PortalLayout } from '@/components/auth/PortalLayout';
import { PORTAL_ROLES } from '@/lib/routing';

/** Ward officer portal: the ward's queue and the actions on each request (own ward only, enforced by the API). Tabs: PORTAL_TABS in lib/routing.ts. */
export default function WardLayout({ children }: { children: ReactNode }) {
  return <PortalLayout roles={PORTAL_ROLES.ward}>{children}</PortalLayout>;
}
