'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { RequireRole } from '@/components/auth/RequireRole';
import { useI18n } from '@/lib/i18n';
import { PORTAL_ROLES } from '@/lib/routing';

/**
 * Citizen portal frame: every page under /citizen is
 *   1. redirected to login by proxy.ts if there's no session cookie at all,
 *   2. guarded here by RequireRole (citizens only; others see "no access"),
 *   3. and, for real, protected by the API (own requests only).
 */
// `matches`: which URLs count as "this tab" (a request's detail page belongs to "My requests").
const LINKS = [
  { href: '/citizen', key: 'nav.myRequests', matches: (p: string) => p === '/citizen' || p.startsWith('/citizen/requests') },
  { href: '/citizen/apply', key: 'nav.apply', matches: (p: string) => p.startsWith('/citizen/apply') },
] as const;

export default function CitizenLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <RequireRole roles={PORTAL_ROLES.citizen}>
      <div className="border-b border-line bg-surface">
        <nav aria-label={t('citizen.portal')} className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4">
          <span className="mr-3 py-3 text-sm font-semibold text-muted">{t('citizen.portal')}</span>
          {LINKS.map((link) => {
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
