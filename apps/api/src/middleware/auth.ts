import type { Role } from '@sewa/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../errors.js';
import { readCookie, SESSION_COOKIE, sessionCookieOptions } from '../security/cookies.js';
import { verifySessionToken } from '../security/token.js';

/**
 * AUTHENTICATION ("who are you?"): the request must carry a valid login cookie.
 * On success, `req.user` holds { id, role, wardId, localLevelId } for the next steps.
 * Missing, expired or tampered token → 401 UNAUTHENTICATED.
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  const token = readCookie(req, SESSION_COOKIE);
  const user = token ? verifySessionToken(token) : null;
  if (!user) {
    // A cookie was sent but it's expired or tampered with: tell the browser to delete it, so the dead
    // token isn't sent with every later request (and the web app sees a clean "logged out" state).
    if (token) {
      const { maxAge: _ignored, ...options } = sessionCookieOptions();
      res.clearCookie(SESSION_COOKIE, options);
    }
    next(new AppError('UNAUTHENTICATED', 'Please log in'));
    return;
  }
  req.user = user;
  next();
};

/**
 * AUTHORIZATION by role ("are you allowed to use this route?"). Use AFTER requireAuth:
 *   router.post('/requests', requireAuth, requireRole('CITIZEN'), createRequest)
 * Wrong role → 403 FORBIDDEN. (Which ward/palika the user may touch is checked later, in the service.)
 */
export function requireRole(...allowed: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      next(new AppError('FORBIDDEN', 'You do not have permission to do this'));
      return;
    }
    next();
  };
}
