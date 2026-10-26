import { Router, type Router as ExpressRouter } from 'express';
import { getTrackingHandler } from '../controllers/tracking.controller.js';
import { createTrackRateLimit } from '../middleware/rateLimit.js';

/** Public tracking. A function, so each app instance gets its own rate-limit counter. */
export function createTrackingRouter(): ExpressRouter {
  const router = Router();
  router.get('/track/:trackingCode', createTrackRateLimit(), getTrackingHandler);
  return router;
}
