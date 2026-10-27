import type { ApiErrorBody, ErrorCode } from '@sewa/shared';
import axios, { AxiosError } from 'axios';

/**
 * The ONE axios instance every API function uses.
 *
 *  - baseURL '/api/v1': same origin; next.config.ts forwards it to the Express API, so the httpOnly
 *    login cookie is sent automatically (`withCredentials`). The page's JavaScript never sees the token.
 *  - timeout: a hung request fails after 15 s instead of spinning forever.
 *  - Response interceptor: every failure becomes ONE error type, `ApiError`, carrying our API's
 *    error `code` (VALIDATION_ERROR, CONFLICT, …). Pages and hooks only ever handle ApiError.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK' | 'TIMEOUT',
    message: string,
    readonly requestId?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const client = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  timeout: 15_000,
  headers: { Accept: 'application/json' },
});

/**
 * Session-expiry hook. The 8-hour login token can expire (or the account can be removed) while a page
 * is open; the API then answers 401. The app registers a handler (see SessionWatcher in providers.tsx)
 * that clears cached data and sends the user to the login page. Kept as a setter so this file stays
 * free of React and routing code.
 */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

// For these calls a 401 is a normal answer ("nobody logged in" / "wrong password"), not an expired session.
const EXPECTS_401 = ['/auth/me', '/auth/login'];

client.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    if (error.response?.status === 401 && !EXPECTS_401.includes(error.config?.url ?? '')) {
      onUnauthorized?.();
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return Promise.reject(new ApiError(0, 'TIMEOUT', 'The server took too long to answer.'));
    }
    if (!error.response) {
      return Promise.reject(new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection.'));
    }
    const body = error.response.data;
    return Promise.reject(
      new ApiError(
        error.response.status,
        body?.error?.code ?? 'INTERNAL',
        body?.error?.message ?? 'Something went wrong',
        body?.requestId,
        body?.error?.details,
      ),
    );
  },
);
