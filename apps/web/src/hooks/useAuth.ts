'use client';

import type { AuthUser, LoginInput, RegisterInput } from '@sewa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMe, login, logout, register } from '@/api/auth.api';
import { queryKeys } from './queryKeys';

/** Who is logged in (null = nobody). JS can't read the httpOnly cookie, so we ask the API. */
export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: getMe, staleTime: 5 * 60_000 });
}

/** After login or sign-up: forget everything cached for the previous user, remember the new one. */
function useSetSession() {
  const queryClient = useQueryClient();
  return (user: AuthUser) => {
    queryClient.clear(); // never show data cached for the previous user
    queryClient.setQueryData(queryKeys.me, user);
  };
}

export function useLogin() {
  const setSession = useSetSession();
  return useMutation({ mutationFn: (input: LoginInput) => login(input), onSuccess: setSession });
}

export function useRegister() {
  const setSession = useSetSession();
  return useMutation({ mutationFn: (input: RegisterInput) => register(input), onSuccess: setSession });
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

/**
 * Demo accounts (all fake, @example.com), one per role, for "Demo mode" on the login page.
 * The password is public on purpose: it's a demo. They log in through the normal form.
 */
export const DEMO_PASSWORD = 'demo1234';
export const DEMO_ACCOUNTS = [
  { email: 'citizen@example.com', labelKey: 'login.asCitizen' },
  { email: 'officer.ward1@example.com', labelKey: 'login.asOfficer' },
  { email: 'officer2.ward1@example.com', labelKey: 'login.asOfficer2' },
  { email: 'officer.ward2@example.com', labelKey: 'login.asOfficerWard2' },
  { email: 'palika.admin@example.com', labelKey: 'login.asPalika' },
  { email: 'system.admin@example.com', labelKey: 'login.asSystem' },
] as const;
