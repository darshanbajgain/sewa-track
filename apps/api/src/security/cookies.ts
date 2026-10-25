import type { CookieOptions, Request } from 'express';
import { env } from '../config/env.js';

/**
 * The login token travels in a cookie (PRD F3), with these protections:
 *   httpOnly   → JavaScript in the page cannot read it, so an XSS bug can't steal the token
 *   secure     → only sent over HTTPS (in production; local dev uses plain http)
 *   sameSite   → 'lax': not sent on cross-site POSTs, which blocks most CSRF attacks
 *   maxAge     → the browser drops it when the session ends (same as the token's expiry)
 */
export const SESSION_COOKIE = 'sewa_session';

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: env.SESSION_HOURS * 60 * 60 * 1000,
  };
}

/**
 * Reads one cookie from the request's `Cookie` header ("a=1; sewa_session=xyz; b=2").
 * A few lines here instead of the cookie-parser package: we only ever need this one cookie.
 */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key !== name) continue;
    try {
      return decodeURIComponent(rest.join('='));
    } catch {
      return undefined; // malformed value (e.g. "%E0%A4"): treat as no cookie, never crash
    }
  }
  return undefined;
}
