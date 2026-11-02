import { Router, type Router as ExpressRouter } from 'express';
import { getUsers, patchUser, postUser } from '../controllers/admin.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

/** User management: system admin ONLY (PRD F14). Staff accounts can be created nowhere else. */
export const adminRouter: ExpressRouter = Router();
adminRouter.use('/admin', requireAuth, requireRole('SYSTEM_ADMIN'));
adminRouter.get('/admin/users', getUsers);
adminRouter.post('/admin/users', postUser);
adminRouter.patch('/admin/users/:id', patchUser);
