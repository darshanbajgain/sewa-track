import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors.js';
import { logger } from '../logger.js';

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

  // 3. Broken JSON body (express.json() fails to parse) → 400, not 500.
  if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON', details: {} },
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
