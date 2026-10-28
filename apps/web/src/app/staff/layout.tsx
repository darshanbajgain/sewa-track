'use client';

import type { Role } from '@sewa/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { RequireRole } from '@/components/auth/RequireRole';
import { useMe } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { PORTAL_ROLES } from '@/lib/routing';

/**
 * Staff portal frame (ward officer, palika admin, system admin). Same three layers as /citizen:
 * proxy.ts (cookie?) → RequireRole (right role?) → the API (scope: own ward / own palika).
 * The "Reports" tab is shown only to roles that may call /stats/summary.
 */
const LINKS: { href: string; key: 'staff.queue' | 'staff.reports'; roles: readonly Role[]; matches: (p: string) => boolean }[] = [
  { href: '/staff', key: 'staff.queue', roles: PORTAL_ROLES.staff, matches: (p) => p === '/staff' || p.startsWith('/staff/requests') },
  { href: '/staff/reports', key: 'staff.reports', roles: PORTAL_ROLES.reports, matches: (p) => p.startsWith('/staff/reports') },
];

export default function StaffLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const role = useMe().data?.role;

  return (
    <RequireRole roles={PORTAL_ROLES.staff}>
      <div className="border-b border-line bg-surface">
        <nav aria-label={t('staff.portal')} className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4">
          <span className="mr-3 py-3 text-sm font-semibold text-muted">{t('staff.portal')}</span>
          {LINKS.filter((link) => role && link.roles.includes(role)).map((link) => {
            const active = link.matches(pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 items-center px-3 text-sm font-semibold no-underline ${
                  active ? 'text-primary shadow-[inset_0_-3px_0_var(--color-primary)]' : 'text-ink hover:text-primary'
                }`}
              >
                {t(link.key)}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </RequireRole>
  );
}
