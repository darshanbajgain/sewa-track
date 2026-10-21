import { Router, type Router as ExpressRouter } from 'express';
import { getHealth } from '../controllers/health.controller.js';

// Routes only wire a URL + method to a controller. No logic here.
export const healthRouter: ExpressRouter = Router();

healthRouter.get('/health', getHealth);
