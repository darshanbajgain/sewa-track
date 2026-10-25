import { createRequestSchema } from '@sewa/shared';
import type { RequestHandler } from 'express';
import { listMyRequests, submitRequest } from '../services/request.service.js';

/** POST /api/v1/requests (citizen): submit a new request. */
export const postRequest: RequestHandler = async (req, res) => {
  const input = createRequestSchema.parse(req.body); // bad input → 400 with field details
  const created = await submitRequest(req.user!, input);
  // 201 Created = a new resource was made. The citizen needs the tracking code to follow it.
  res.status(201).json({ request: created });
};

/** GET /api/v1/requests/mine (citizen): own requests only. */
export const getMyRequests: RequestHandler = async (req, res) => {
  res.json({ requests: await listMyRequests(req.user!) });
};
