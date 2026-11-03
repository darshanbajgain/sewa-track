'use client';

import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useEffectEvent } from 'react';
import { setUnauthorizedHandler } from '@/api/client';
import { queryKeys } from '@/hooks/queryKeys';
import { isLoginPath, loginUrl } from '@/lib/routing';

/**
 * When any API call says 401 (expired or invalid session): forget everything cached for the old user
 * and send them to the login page with a "session expired" message and a way back to this page.
 * Renders nothing; it just registers the handler with the axios client.
 */
export function SessionWatcher() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();

  const handleExpired = useEffectEvent(() => {
    queryClient.clear();
    queryClient.setQueryData(queryKeys.me, null);
    if (!isLoginPath(pathname)) router.replace(loginUrl(pathname, 'expired'));
  });

  useEffect(() => {
    setUnauthorizedHandler(() => handleExpired());
    return () => setUnauthorizedHandler(null);
  }, []);

  return null;
}
