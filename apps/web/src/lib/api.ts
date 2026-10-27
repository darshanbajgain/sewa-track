import type { ApiErrorBody, ErrorCode } from '@sewa/shared';

/**
 * The one way the web app calls the API.
 *  - Same origin: "/api/v1/…" is forwarded to Express by next.config.ts, so the httpOnly login
 *    cookie is sent automatically (the page's JavaScript never sees the token).
 *  - Every API error has the same JSON shape, so it becomes one ApiError with `code`, which pages
 *    can react to (e.g. CONFLICT → "updated by someone else, reload").
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK',
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection.');
  }

  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const err = body as ApiErrorBody | null;
    throw new ApiError(res.status, err?.error.code ?? 'INTERNAL', err?.error.message ?? 'Something went wrong', err?.requestId);
  }
  return body as T;
}

/** POST helper: JSON body in, typed JSON out. */
export const post = <T>(path: string, data: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(data) });
