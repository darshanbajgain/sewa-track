import { Router, type Router as ExpressRouter } from 'express';
import {
  getDistrictsHandler,
  getLocalLevelsHandler,
  getProvincesHandler,
  getServiceTypesHandler,
  getWardsHandler,
} from '../controllers/reference.controller.js';

// Public reference data: no login needed (PRD §9).
export const referenceRouter: ExpressRouter = Router();

referenceRouter.get('/service-types', getServiceTypesHandler);
referenceRouter.get('/locations/provinces', getProvincesHandler);
referenceRouter.get('/locations/districts', getDistrictsHandler);
referenceRouter.get('/locations/local-levels', getLocalLevelsHandler);
referenceRouter.get('/locations/wards', getWardsHandler);
