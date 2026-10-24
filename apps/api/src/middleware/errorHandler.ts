import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors.js';
import { logger } from '../logger.js';

/**
 * Errors thrown by express.json() (the body-parser library) carry a `type` and a 4xx `status`.
 * They are always the client's fault, so they must become 400, never 500.
 */
interface BodyParserError {
  type: string;
  status: number;
}

function isBodyParserError(err: unknown): err is BodyParserError {
  if (typeof err !== 'object' || err === null) return false;
  const { type, status } = err as Partial<BodyParserError>;
  return typeof type === 'string' && typeof status === 'number' && status >= 400 && status < 500;
}

// Our own wording for the common cases; anything else gets a generic message.
const BODY_ERROR_MESSAGES: Record<string, string> = {
  'entity.parse.failed': 'Request body is not valid JSON',
  'entity.too.large': 'Request body is too large',
  'encoding.unsupported': 'Compressed request bodies are not accepted',
};

/** Any URL that no router matched ends up here → standard 404 error. */
export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError('NOT_FOUND', `Route ${req.method} ${req.path} not found`));
};

/**
 * The single place where errors become HTTP responses. Every error has the same shape:
 *   { "error": { "code", "message", "details" }, "requestId" }
 *
 * Express 5 sends errors thrown inside async handlers here automatically
 * (Express 4 needed try/catch or a wrapper in every route).
 *
 * Express knows this is an error handler because it has FOUR parameters (err, req, res, next).
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // 1. Errors we threw on purpose: safe to show their message to the client.
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
      requestId: req.id,
    });
    return;
  }

  // 2. Zod validation failures → 400 with which field failed and why.
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: { issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
      },
      requestId: req.id,
    });
    return;
  }

  // 3. Bad request body (broken JSON, too large, compressed, ...) → 400, not 500.
  if (isBodyParserError(err)) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: BODY_ERROR_MESSAGES[err.type] ?? 'Invalid request body',
        details: {},
      },
      requestId: req.id,
    });
    return;
  }

  // 4. Anything else is a bug. Log full details (with requestId) for us,
  //    but give the client a generic message: never a stack trace or SQL error.
  logger.error({ err, requestId: req.id, method: req.method, path: req.path }, 'Unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Something went wrong', details: {} },
    requestId: req.id,
  });
};
