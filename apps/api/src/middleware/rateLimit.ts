import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';
import { AppError } from '../errors.js';

/**
 * Per-IP rate limits (PRD §10). Each is a FUNCTION that creates a new limiter, so every
 * createApp() (and every test) gets its own counter.
 *
 * The counter lives in memory, which is fine for one API instance. With several instances behind a
 * load balancer, a shared store (e.g. Redis) would be needed. Documented trade-off.
 */
function createRateLimit(limitPerMinute: number, message: string): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: limitPerMinute,
    standardHeaders: 'draft-8', // tells clients their remaining attempts in a standard header
    legacyHeaders: false,
    // Send our standard error JSON (429 RATE_LIMITED) instead of the library's plain text.
    handler: (_req, _res, next) => next(new AppError('RATE_LIMITED', message)),
  });
}

/** Login: 5 per minute. Slows down password guessing and credential stuffing. */
export const createLoginRateLimit = () => createRateLimit(5, 'Too many login attempts. Try again in a minute.');

/** Sign-up: 5 per minute. Stops scripted mass sign-ups and testing many emails for "already exists". */
export const createRegisterRateLimit = () => createRateLimit(5, 'Too many sign-up attempts. Try again in a minute.');

/** Public tracking: 10 per minute. Makes guessing tracking codes pointless (32^10 possible codes). */
export const createTrackRateLimit = () => createRateLimit(10, 'Too many tracking lookups. Try again in a minute.');
