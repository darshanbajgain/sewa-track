import { Router, type Router as ExpressRouter } from 'express';
import { getMapHandler, getSummaryHandler } from '../controllers/stats.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const statsRouter: ExpressRouter = Router();

// Public: aggregates only (counts and rates per area), no individual requests (PRD F8).
statsRouter.get('/stats/map', getMapHandler);
// Staff report: palika admin sees their palika, system admin sees Nepal (PRD F7).
statsRouter.get('/stats/summary', requireAuth, requireRole('PALIKA_ADMIN', 'SYSTEM_ADMIN'), getSummaryHandler);
