import { Router, type Router as ExpressRouter } from 'express';
import { getMe, postLogin, postLogout, postRegister } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { createLoginRateLimit, createRegisterRateLimit } from '../middleware/rateLimit.js';

/**
 * Auth routes. Read each line left to right: URL → checks that run first → controller.
 * Built by a function so each app instance gets its own rate-limit counter.
 */
export function createAuthRouter(): ExpressRouter {
  const router = Router();
  router.post('/auth/login', createLoginRateLimit(), postLogin);
  router.post('/auth/register', createRegisterRateLimit(), postRegister); // citizens only
  router.post('/auth/logout', postLogout);
  router.get('/auth/me', requireAuth, getMe);
  return router;
}
