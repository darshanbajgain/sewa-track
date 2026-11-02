'use client';

import type { ReactNode } from 'react';
import { PortalLayout, under } from '@/components/auth/PortalLayout';
import { PORTAL_ROLES } from '@/lib/routing';

/** Citizen portal: my requests (and their detail pages) · apply. */
export default function CitizenLayout({ children }: { children: ReactNode }) {
  return (
    <PortalLayout
      title="citizen.portal"
      roles={PORTAL_ROLES.citizen}
      links={[
        { href: '/citizen', key: 'nav.myRequests', matches: (p) => p === '/citizen' || under('/citizen/requests')(p) },
        { href: '/citizen/apply', key: 'nav.apply', matches: under('/citizen/apply') },
      ]}
    >
      {children}
    </PortalLayout>
  );
}
