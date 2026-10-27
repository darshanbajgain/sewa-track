'use client';

import type { CreateRequestInput, TransitionBody } from '@sewa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  changeStatus,
  getMyRequests,
  getQueue,
  getRequestDetail,
  markFeePaid,
  submitRequest,
  type QueueFilters,
} from '@/api/requests.api';
import { queryKeys } from './queryKeys';

/** Reads */

export const useMyRequests = () => useQuery({ queryKey: queryKeys.requests.mine, queryFn: getMyRequests });

export const useQueue = (filters: QueueFilters) =>
  useQuery({
    queryKey: queryKeys.requests.queue(filters),
    queryFn: () => getQueue(filters),
    placeholderData: (previous) => previous, // keep the old page visible while the next one loads
  });

export const useRequestDetail = (id: string) =>
  useQuery({ queryKey: queryKeys.requests.detail(id), queryFn: () => getRequestDetail(id) });

/**
 * Writes. After any change, invalidate ['requests'] (queue, my requests, every detail) and ['stats'],
 * so every screen refetches fresh data on its own. That's the main job of these hooks.
 */
function useInvalidateAfterChange() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.requests.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all }),
    ]);
}

export function useSubmitRequest() {
  const invalidate = useInvalidateAfterChange();
  return useMutation({ mutationFn: (input: CreateRequestInput) => submitRequest(input), onSuccess: invalidate });
}

export function useChangeStatus(id: string) {
  const invalidate = useInvalidateAfterChange();
  return useMutation({
    mutationFn: (body: TransitionBody) => changeStatus(id, body),
    // Also on error: a 409 means our copy is old, so refetch the latest version either way.
    onSettled: invalidate,
  });
}

export function useMarkFeePaid(id: string) {
  const invalidate = useInvalidateAfterChange();
  return useMutation({ mutationFn: (version: number) => markFeePaid(id, version), onSettled: invalidate });
}
