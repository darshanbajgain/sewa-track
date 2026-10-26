import type { RequestHandler } from 'express';
import { getTracking } from '../services/tracking.service.js';

/** GET /api/v1/track/:trackingCode (public, no login, rate limited) */
export const getTrackingHandler: RequestHandler = async (req, res) => {
  // The code comes from the URL path. The service normalizes and validates it.
  const tracking = await getTracking(String(req.params.trackingCode));
  // Tell browsers and proxies NOT to store it: the status can change at any moment.
  res.setHeader('Cache-Control', 'no-store');
  res.json({ tracking });
};
