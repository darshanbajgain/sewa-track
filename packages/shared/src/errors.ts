/**
 * The API's error codes and response shape (PRD §9), shared so the web app can
 * react to `error.code` (e.g. show "Reload" on CONFLICT) with full type safety.
 * The HTTP status for each code is decided by the API (apps/api/src/errors.ts).
 */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_TRANSITION',
  'RATE_LIMITED',
  'INTERNAL',
  'UPSTREAM_UNAVAILABLE',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** The body of every error response from the API. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details: Record<string, unknown>;
  };
  requestId: string;
}
