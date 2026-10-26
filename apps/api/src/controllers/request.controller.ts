import { createRequestSchema, queueQuerySchema, requestIdParamsSchema } from '@sewa/shared';
import type { RequestHandler } from 'express';
import { listMyRequests, submitRequest } from '../services/request.service.js';
import { getQueue, getRequestDetail } from '../services/staff.service.js';

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

/** GET /api/v1/requests (staff): scoped queue with filters and pagination. */
export const getQueueHandler: RequestHandler = async (req, res) => {
  const query = queueQuerySchema.parse(req.query); // bad filter value → 400
  res.json(await getQueue(req.user!, query));
};

/** GET /api/v1/requests/:id (owner or scoped staff): full detail + allowed actions. */
export const getRequestDetailHandler: RequestHandler = async (req, res) => {
  const { id } = requestIdParamsSchema.parse(req.params); // not a uuid → 400
  res.json({ request: await getRequestDetail(req.user!, id) });
};
