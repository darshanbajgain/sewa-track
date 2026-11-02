'use client';

import type { ReactNode } from 'react';
import { PortalLayout, under } from '@/components/auth/PortalLayout';
import { PORTAL_ROLES } from '@/lib/routing';

/** Ward officer portal: the ward's queue and the actions on each request (own ward only, enforced by the API). */
export default function WardLayout({ children }: { children: ReactNode }) {
  return (
    <PortalLayout
      title="ward.portal"
      roles={PORTAL_ROLES.ward}
      links={[{ href: '/ward', key: 'staff.queue', matches: (p) => p === '/ward' || under('/ward/requests')(p) }]}
    >
      {children}
    </PortalLayout>
  );
}
