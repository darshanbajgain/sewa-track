import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { AppError } from '../errors.js';

export const PROXY_SECRET_HEADER = 'x-proxy-secret';

// The platform health check and the keep-awake pinger call these directly, not through the website.
// Neither reads or changes data, and neither is rate limited.
const OPEN_PATHS = new Set(['/api/v1/live', '/api/v1/health']);

/**
 * Only requests forwarded by our own web app may use the API (docs/deployment.md §5).
 *
 * Why: the rate limits count per client IP, and the API finds that IP by skipping a FIXED number of
 * proxies (TRUST_PROXY). Through the website there is one more proxy than when calling the API host
 * directly, so no single number is right for both. If the website is the only way in, the number is
 * always the same. The web app adds this header; a direct caller doesn't know the secret.
 *
 * No secret set (local dev, tests, docker compose) = the check is off.
 */
export function requireProxySecret(secret: string | undefined): RequestHandler {
  if (!secret) return (_req, _res, next) => next();
  const expected = sha256(secret);

  return (req, _res, next) => {
    if (OPEN_PATHS.has(req.path)) return next();

    const sent = req.get(PROXY_SECRET_HEADER);
    // Compare hashes with timingSafeEqual: a normal === stops at the first wrong character, and the
    // time difference could leak the secret bit by bit. Hashing gives both sides the same length.
    if (sent && timingSafeEqual(sha256(sent), expected)) return next();

    next(new AppError('FORBIDDEN', 'Use the Sewa Track website to access this API'));
  };
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
