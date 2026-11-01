import type { AuthUser, LoginInput, RegisterInput } from '@sewa/shared';
import { ApiError, client } from './client';
import { ENDPOINTS } from './endpoints';

/** Auth API: plain async functions (no React). Hooks in src/hooks/useAuth.ts wrap them. */

export async function login(input: LoginInput): Promise<AuthUser> {
  const { data } = await client.post<{ user: AuthUser }>(ENDPOINTS.auth.login, input);
  return data.user;
}

/** Citizen sign-up. The API creates a CITIZEN and logs them in (sets the cookie). */
export async function register(input: RegisterInput): Promise<AuthUser> {
  const { data } = await client.post<{ user: AuthUser }>(ENDPOINTS.auth.register, input);
  return data.user;
}

export async function logout(): Promise<void> {
  await client.post(ENDPOINTS.auth.logout);
}

/** The logged-in user, or null when nobody is logged in (401 is a normal answer here, not an error). */
export async function getMe(): Promise<AuthUser | null> {
  try {
    const { data } = await client.get<{ user: AuthUser }>(ENDPOINTS.auth.me);
    return data.user;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}
