'use client';

import type { ReactNode } from 'react';
import { PortalLayout } from '@/components/auth/PortalLayout';
import { PORTAL_ROLES } from '@/lib/routing';

/** Palika admin portal: all wards' requests (read only), reports and the delay map. Tabs: PORTAL_TABS in lib/routing.ts. */
export default function PalikaLayout({ children }: { children: ReactNode }) {
  return <PortalLayout roles={PORTAL_ROLES.palika}>{children}</PortalLayout>;
}
