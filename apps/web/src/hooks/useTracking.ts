'use client';

import { useQuery } from '@tanstack/react-query';
import { trackRequest } from '@/api/tracking.api';
import { queryKeys } from './queryKeys';

/** Public tracking. Only runs once a code is entered; no retries (a 404 or 429 won't fix itself). */
export const useTracking = (code: string | null) =>
  useQuery({
    queryKey: queryKeys.tracking(code ?? ''),
    queryFn: () => trackRequest(code!),
    enabled: code !== null,
    retry: false,
  });
