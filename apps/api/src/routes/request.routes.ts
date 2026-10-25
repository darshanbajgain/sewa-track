import { Router, type Router as ExpressRouter } from 'express';
import { getMyRequests, postRequest } from '../controllers/request.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

// Service requests. Every route: must be logged in (401) AND have the right role (403).
export const requestRouter: ExpressRouter = Router();

requestRouter.post('/requests', requireAuth, requireRole('CITIZEN'), postRequest);
// '/requests/mine' is registered before any future '/requests/:id', or "mine" would be read as an id.
requestRouter.get('/requests/mine', requireAuth, requireRole('CITIZEN'), getMyRequests);
