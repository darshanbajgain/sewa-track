import { loginSchema, registerSchema } from '@sewa/shared';
import type { RequestHandler } from 'express';
import { SESSION_COOKIE, sessionCookieOptions } from '../security/cookies.js';
import { getCurrentUser, login, register } from '../services/auth.service.js';

/**
 * Controllers: read the HTTP request, validate it, call the service, shape the HTTP response.
 * No SQL and no business rules here.
 */

/** POST /api/v1/auth/login  body: { email, password } */
export const postLogin: RequestHandler = async (req, res) => {
  // .parse throws a ZodError on bad input → the error handler turns it into 400 VALIDATION_ERROR.
  const input = loginSchema.parse(req.body);
  const { user, token } = await login(input);

  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  res.status(200).json({ user }); // the token itself is NOT in the body: only in the httpOnly cookie
};

/** POST /api/v1/auth/register  body: { name, email, password } → 201, logged in as a CITIZEN */
export const postRegister: RequestHandler = async (req, res) => {
  const input = registerSchema.parse(req.body);
  const { user, token } = await register(input);

  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  res.status(201).json({ user });
};

/** POST /api/v1/auth/logout: removes the cookie from the browser. */
export const postLogout: RequestHandler = (_req, res) => {
  const { maxAge: _ignored, ...options } = sessionCookieOptions();
  res.clearCookie(SESSION_COOKIE, options); // same options (path, sameSite...) or the browser keeps it
  res.status(204).end();
};

/** GET /api/v1/auth/me: who is logged in? (requireAuth runs first and sets req.user) */
export const getMe: RequestHandler = async (req, res) => {
  const user = await getCurrentUser(req.user!.id);
  res.status(200).json({ user });
};
