import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';
import { AppError } from '../errors.js';

/**
 * Login rate limit (PRD §10): at most 5 attempts per minute per IP address.
 * Slows down password guessing ("brute force") and credential stuffing.
 *
 * A FUNCTION that creates a new limiter (not one shared object), so each createApp() gets its own
 * counter. That keeps tests independent of each other.
 *
 * The counter lives in memory, which is fine for one API instance. With several instances behind a
 * load balancer, a shared store (e.g. Redis) would be needed. Documented trade-off.
 */
export function createLoginRateLimit(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8', // tells clients their remaining attempts in a standard header
    legacyHeaders: false,
    // Send our standard error JSON (429 RATE_LIMITED) instead of the library's plain text.
    handler: (_req, _res, next) => next(new AppError('RATE_LIMITED', 'Too many login attempts. Try again in a minute.')),
  });
}
