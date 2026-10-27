'use client';

import type { Role } from '@sewa/shared';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Alert, ButtonLink, Spinner } from '@/components/common';
import { useMe } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { loginUrl } from '@/lib/routing';

/**
 * Client-side guard for a whole portal (used by the /citizen and /staff layouts in P7.2–P7.3):
 *   not logged in → go to login (and come back here afterwards)
 *   wrong role    → "you don't have access" (403), with a link home
 *
 * This is for the USER EXPERIENCE only. The real protection is the API: every endpoint checks login,
 * role and scope on the server (AGENTS §6), so hiding a page in the browser is never the security.
 */
export function RequireRole({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const { t } = useI18n();
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (me.isSuccess && me.data === null) router.replace(loginUrl(pathname, 'required'));
  }, [me.isSuccess, me.data, pathname, router]);

  if (me.isLoading || (me.isSuccess && me.data === null)) {
    return (
      <p role="status" className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-10 text-muted">
        <Spinner /> {t('common.loading')}
      </p>
    );
  }
  if (me.data && !roles.includes(me.data.role)) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-10">
        <Alert tone="error">{t('common.forbidden')}</Alert>
        <ButtonLink href="/" variant="secondary" className="self-start">
          {t('nav.home')}
        </ButtonLink>
      </div>
    );
  }
  return <>{children}</>;
}
