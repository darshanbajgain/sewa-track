import { mapQuerySchema } from '@sewa/shared';
import type { RequestHandler } from 'express';
import { getMapStats, getSummary } from '../services/stats.service.js';

/** GET /api/v1/stats/map (public): aggregates per district or palika for the delay map. */
export const getMapHandler: RequestHandler = async (req, res) => {
  const query = mapQuerySchema.parse(req.query); // unknown level/metric → 400
  // Aggregates change slowly and are public: browsers/proxies may reuse them for a minute.
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json(await getMapStats(query));
};

/** GET /api/v1/stats/summary (palika admin / system admin) */
export const getSummaryHandler: RequestHandler = async (req, res) => {
  res.json(await getSummary(req.user!));
};
