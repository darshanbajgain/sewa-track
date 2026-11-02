'use client';

import type { Role } from '@sewa/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { RequireRole } from '@/components/auth/RequireRole';
import { useI18n } from '@/lib/i18n';

type Key = Parameters<ReturnType<typeof useI18n>['t']>[0];

export interface PortalLink {
  href: string;
  key: Key;
  /** Which URLs count as "this tab" (e.g. a request's detail page belongs to the queue tab). */
  matches: (pathname: string) => boolean;
}

/**
 * The frame of every logged-in portal (/citizen, /ward, /palika, /admin): a role guard + a tab bar.
 * Each portal's layout.tsx only says WHO may enter and WHICH tabs it has.
 *
 * Three layers protect a portal: proxy.ts (no cookie → login) → RequireRole here (wrong role → "no
 * access") → the API, the real security (every endpoint checks role and scope again).
 */
export function PortalLayout({ title, roles, links, children }: { title: Key; roles: readonly Role[]; links: PortalLink[]; children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <RequireRole roles={roles}>
      <div className="border-b border-line bg-surface">
        <nav aria-label={t(title)} className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4">
          <span className="mr-3 py-3 text-sm font-semibold text-muted">{t(title)}</span>
          {links.map((link) => {
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

/** Helpers for `matches`: the exact page, or the page plus everything under a sub-path. */
export const exactly = (path: string) => (p: string) => p === path;
export const under = (...paths: string[]) => (p: string) => paths.some((path) => p === path || p.startsWith(`${path}/`));
