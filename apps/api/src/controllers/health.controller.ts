import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { pingDatabase } from '../repositories/health.repository.js';

/**
 * GET /api/v1/health
 * Used by the hosting platform and the post-deploy smoke test to ask "is this API alive?".
 *
 * 200 = API and database are up. 503 = API is running but the database is not, so the
 * platform knows not to send traffic here. (No service layer: there is no business logic.)
 */
/**
 * GET /api/v1/live
 * "Is the process running?" and nothing more: it never touches the database.
 *
 * Why a second check: the keep-awake pinger calls the API every 10 minutes so the free host doesn't
 * put it to sleep. If it called /health, every ping would also wake the database, which then could
 * never sleep and would use up its free compute hours. Liveness (/live) vs readiness (/health).
 */
export const getLive: RequestHandler = (_req, res) => {
  res.json({ status: 'ok' });
};

export const getHealth: RequestHandler = async (_req, res) => {
  const dbUp = await pingDatabase();

  res.status(dbUp ? 200 : 503).json({
    status: dbUp ? 'ok' : 'degraded',
    db: dbUp ? 'up' : 'down',
    version: env.APP_VERSION,
    commit: env.GIT_COMMIT,
  });
};
