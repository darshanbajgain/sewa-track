import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { RequestHandler } from 'express';
import { AppError } from '../errors.js';

export const PROXY_SECRET_HEADER = 'x-proxy-secret';
export const CLIENT_IP_HEADER = 'x-client-ip';

// The platform health check and the keep-awake pinger call these directly, not through the website.
// Neither reads or changes data, and neither is rate limited.
const OPEN_PATHS = new Set(['/api/v1/live', '/api/v1/health']);

/**
 * Only requests forwarded by our own web app may use the API (docs/deployment.md §5).
 *
 * Why: the rate limits count per visitor IP. When the web app forwards a request to another host, the
 * visitor's IP doesn't arrive in X-Forwarded-For (the API only sees the web host's changing outgoing IP),
 * so the web app sends it in X-Client-IP. Anyone could send that header, so it is believed ONLY together
 * with the right secret, and the secret is only useful if every request must carry it.
 *
 * No secret set (local dev, tests, docker compose) = the check is off and X-Client-IP is ignored.
 */
export function requireProxySecret(secret: string | undefined): RequestHandler {
  if (!secret) return (_req, _res, next) => next();
  const expected = sha256(secret);

  return (req, _res, next) => {
    if (OPEN_PATHS.has(req.path)) return next();

    const sent = req.get(PROXY_SECRET_HEADER);
    // Compare hashes with timingSafeEqual: a normal === stops at the first wrong character, and the
    // time difference could leak the secret bit by bit. Hashing gives both sides the same length.
    if (!sent || !timingSafeEqual(sha256(sent), expected)) {
      return next(new AppError('FORBIDDEN', 'Use the Sewa Track website to access this API'));
    }

    const clientIp = req.get(CLIENT_IP_HEADER);
    // isIP returns 0 for anything that isn't an IPv4/IPv6 address, so junk never becomes a rate-limit key.
    if (clientIp && isIP(clientIp)) req.clientIp = clientIp;
    next();
  };
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
