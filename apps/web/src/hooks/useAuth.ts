'use client';

import type { LoginInput } from '@sewa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMe, login, logout } from '@/api/auth.api';
import { queryKeys } from './queryKeys';

/** Who is logged in (null = nobody). JS can't read the httpOnly cookie, so we ask the API. */
export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: getMe, staleTime: 5 * 60_000 });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => login(input),
    onSuccess: (user) => {
      queryClient.clear(); // never show data cached for the previous user
      queryClient.setQueryData(queryKeys.me, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(queryKeys.me, null);
    },
  });
}

/** Demo accounts (all fake). The password is public on purpose: it's a demo. */
export const DEMO_PASSWORD = 'demo1234';
export const DEMO_ACCOUNTS = [
  { phone: '9000000001', labelKey: 'login.asCitizen' },
  { phone: '9000000002', labelKey: 'login.asOfficer' },
  { phone: '9000000003', labelKey: 'login.asOfficer2' },
  { phone: '9000000004', labelKey: 'login.asOfficerWard2' },
  { phone: '9000000005', labelKey: 'login.asPalika' },
  { phone: '9000000006', labelKey: 'login.asSystem' },
] as const;
