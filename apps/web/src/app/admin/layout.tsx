'use client';

import type { ReactNode } from 'react';
import { PortalLayout, exactly, under } from '@/components/auth/PortalLayout';
import { PORTAL_ROLES } from '@/lib/routing';

/** System admin portal: national overview · user management · all requests (read only) · delay map. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <PortalLayout
      title="admin.portal"
      roles={PORTAL_ROLES.admin}
      links={[
        { href: '/admin', key: 'admin.overview', matches: exactly('/admin') },
        { href: '/admin/users', key: 'admin.users', matches: under('/admin/users') },
        { href: '/admin/requests', key: 'staff.queue', matches: under('/admin/requests') },
        { href: '/admin/map', key: 'nav.map', matches: under('/admin/map') },
      ]}
    >
      {children}
    </PortalLayout>
  );
}
