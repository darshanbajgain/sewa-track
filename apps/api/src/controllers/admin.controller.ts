import { createStaffSchema, requestIdParamsSchema, updateUserSchema, userListQuerySchema } from '@sewa/shared';
import type { RequestHandler } from 'express';
import { createStaff, listAllUsers, setActive } from '../services/admin.service.js';

/** System admin: user management (PRD F14). Validate → call the service → shape the response. */

/** GET /api/v1/admin/users?role=&q=&page= */
export const getUsers: RequestHandler = async (req, res) => {
  const query = userListQuerySchema.parse(req.query);
  res.status(200).json(await listAllUsers(query));
};

/** POST /api/v1/admin/users  body: { role, name, email, password, wardId | localLevelId } */
export const postUser: RequestHandler = async (req, res) => {
  const input = createStaffSchema.parse(req.body);
  const user = await createStaff(req.user!, input);
  res.status(201).json({ user });
};

/** PATCH /api/v1/admin/users/:id  body: { isActive } */
export const patchUser: RequestHandler = async (req, res) => {
  const { id } = requestIdParamsSchema.parse(req.params); // same "uuid id" rule as /requests/:id
  const { isActive } = updateUserSchema.parse(req.body);
  res.status(200).json({ user: await setActive(id, isActive) });
};
