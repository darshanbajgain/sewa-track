import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

/**
 * Gives every request a unique id and sends it back in the `X-Request-Id` header.
 *
 * Why: when a user reports "I got an error", they (or the error JSON) give us the
 * requestId, and we search the logs for exactly that request. We always generate our
 * own id instead of trusting one from the client, so nobody can inject fake log entries.
 */
export const requestId: RequestHandler = (req, res, next) => {
  req.id = randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};
