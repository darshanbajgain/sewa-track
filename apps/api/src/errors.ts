import type { ErrorCode } from '@sewa/shared';

export type { ErrorCode };

/**
 * Every error code (defined once in @sewa/shared) mapped to its HTTP status (PRD §9).
 * The frontend switches on `error.code` instead of parsing messages.
 *
 * `satisfies Record<ErrorCode, number>`: if someone adds a code to the shared list and
 * forgets to map it here, TypeScript fails the build. The list and the map can't drift apart.
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
} as const satisfies Record<ErrorCode, number>;

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
