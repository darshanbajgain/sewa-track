'use client';

import type { ReactNode } from 'react';
import { PortalLayout, under } from '@/components/auth/PortalLayout';
import { PORTAL_ROLES } from '@/lib/routing';

/** Palika admin portal: all wards' requests (read only) · reports for the palika. */
export default function PalikaLayout({ children }: { children: ReactNode }) {
  return (
    <PortalLayout
      title="palika.portal"
      roles={PORTAL_ROLES.palika}
      links={[
        { href: '/palika', key: 'staff.queue', matches: (p) => p === '/palika' || under('/palika/requests')(p) },
        { href: '/palika/reports', key: 'staff.reports', matches: under('/palika/reports') },
      ]}
    >
      {children}
    </PortalLayout>
  );
}
