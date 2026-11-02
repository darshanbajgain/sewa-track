'use client';

import type { CreateStaffInput } from '@sewa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createStaff, listUsers, setUserActive, type UserListParams } from '@/api/admin.api';
import { queryKeys } from './queryKeys';

export const useUsers = (params: UserListParams) =>
  useQuery({
    queryKey: queryKeys.admin.users(params),
    queryFn: () => listUsers(params),
    placeholderData: (previous) => previous, // keep the old page visible while the next one loads
  });

/** After any change, refetch every user list (all filters/pages start with ['admin']). */
function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
}

export function useCreateStaff() {
  const invalidate = useInvalidateUsers();
  return useMutation({ mutationFn: (input: CreateStaffInput) => createStaff(input), onSuccess: invalidate });
}

export function useSetUserActive() {
  const invalidate = useInvalidateUsers();
  return useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => setUserActive(id, isActive), onSuccess: invalidate });
}
