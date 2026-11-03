'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Spinner } from '@/components/common';
import { useMe } from '@/hooks/useAuth';
import { ROLE_HOME } from '@/lib/routing';

/**
 * Pages for visitors: home, services, track, delay map, login, sign-up. "(public)" is a route group:
 * it shares this layout without adding anything to the URL.
 *
 * A logged-in user doesn't belong here (decided 2026-11-03): they are sent to their own portal, whose
 * menu has only what their role needs. While we don't know yet who it is, the page renders normally,
 * so visitors never wait for this check.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const me = useMe().data;

  useEffect(() => {
    if (me) router.replace(ROLE_HOME[me.role]);
  }, [me, router]);

  if (me) {
    return (
      <div className="flex justify-center py-20" role="status" aria-label="Loading">
        <Spinner />
      </div>
    );
  }
  return children;
}
