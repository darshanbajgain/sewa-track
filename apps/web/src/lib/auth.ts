'use client';

import type { AuthUser, LoginInput } from '@sewa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, post } from './api';

/**
 * Who is logged in? The token lives in an httpOnly cookie that this JavaScript can't read
 * (by design), so we ask the API: GET /auth/me → the user, or 401 → nobody.
 */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api<{ user: AuthUser }>('/auth/me')).user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null; // not logged in is a normal state
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });
}

/** Log in, then refresh everything that depends on who the user is. */
export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => post<{ user: AuthUser }>('/auth/login', input).then((r) => r.user),
    onSuccess: (user) => {
      queryClient.clear(); // drop any data cached for the previous user
      queryClient.setQueryData(['me'], user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => post<void>('/auth/logout', {}),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(['me'], null);
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
