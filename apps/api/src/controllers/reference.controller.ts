import { districtsQuerySchema, localLevelsQuerySchema, wardsQuerySchema } from '@sewa/shared';
import type { RequestHandler, Response } from 'express';
import {
  getDistricts,
  getLocalLevels,
  getProvinces,
  getServiceTypes,
  getWards,
} from '../services/reference.service.js';

/**
 * Public, read-only endpoints (no login): the service catalog and the location dropdowns.
 *
 * This data almost never changes, so we let browsers and proxies cache it for an hour
 * (`Cache-Control`). Fewer requests to the API and a faster form, at no cost.
 */
function cacheForAnHour(res: Response): void {
  res.setHeader('Cache-Control', 'public, max-age=3600');
}

/** GET /api/v1/service-types */
export const getServiceTypesHandler: RequestHandler = async (_req, res) => {
  cacheForAnHour(res);
  res.json({ serviceTypes: await getServiceTypes() });
};

/** GET /api/v1/locations/provinces */
export const getProvincesHandler: RequestHandler = async (_req, res) => {
  cacheForAnHour(res);
  res.json({ provinces: await getProvinces() });
};

/** GET /api/v1/locations/districts?provinceId=3 (provinceId optional) */
export const getDistrictsHandler: RequestHandler = async (req, res) => {
  const { provinceId } = districtsQuerySchema.parse(req.query); // bad value → 400
  cacheForAnHour(res);
  res.json({ districts: await getDistricts(provinceId) });
};

/** GET /api/v1/locations/local-levels?districtId=27 */
export const getLocalLevelsHandler: RequestHandler = async (req, res) => {
  const { districtId } = localLevelsQuerySchema.parse(req.query); // missing or bad → 400
  cacheForAnHour(res);
  res.json({ localLevels: await getLocalLevels(districtId) });
};

/** GET /api/v1/locations/wards?localLevelId=307 */
export const getWardsHandler: RequestHandler = async (req, res) => {
  const { localLevelId } = wardsQuerySchema.parse(req.query);
  cacheForAnHour(res);
  res.json({ wards: await getWards(localLevelId) });
};
