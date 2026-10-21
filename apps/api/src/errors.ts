/**
 * Every error the API can return, mapped to its HTTP status (PRD §9).
 * Keeping the list in one place means codes stay consistent across all endpoints,
 * and the frontend can switch on `error.code` instead of parsing messages.
 */
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_TRANSITION: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  UPSTREAM_UNAVAILABLE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

/**
 * An error we throw on purpose, e.g. `throw new AppError('NOT_FOUND', 'Request not found')`.
 * The error handler turns it into the standard JSON error response.
 * Anything that is NOT an AppError is treated as an unexpected bug (500).
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }
}
