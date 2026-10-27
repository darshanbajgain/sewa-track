'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { SessionWatcher } from '@/components/auth/SessionWatcher';
import { LanguageProvider } from '@/lib/i18n';

/**
 * App-wide client state:
 *  - TanStack Query caches API responses, de-duplicates requests and handles loading/error states.
 *    One QueryClient per browser tab (created once with useState, not on every render).
 *  - LanguageProvider: English / Nepali.
 *  - SessionWatcher: on any 401 (expired session) → clear cached data, go to login.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <SessionWatcher />
        {children}
      </LanguageProvider>
    </QueryClientProvider>
  );
}
