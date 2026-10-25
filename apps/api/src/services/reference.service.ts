import type { DistrictDto, LocalLevelDto, ProvinceDto, ServiceTypeDto, WardDto } from '@sewa/shared';
import { AppError } from '../errors.js';
import { listServiceTypes } from '../repositories/catalog.repository.js';
import { exists, listDistricts, listLocalLevels, listProvinces, listWards } from '../repositories/location.repository.js';

/**
 * Read-only reference data. The one rule here: an unknown parent id is a 404, not an empty list.
 * (An empty list would make the web app show "no palikas" instead of telling the user the
 * district doesn't exist.)
 */

export const getServiceTypes = (): Promise<ServiceTypeDto[]> => listServiceTypes();

export const getProvinces = (): Promise<ProvinceDto[]> => listProvinces();

export async function getDistricts(provinceId?: number): Promise<DistrictDto[]> {
  if (provinceId !== undefined && !(await exists('provinces', provinceId))) {
    throw new AppError('NOT_FOUND', 'Province not found');
  }
  return listDistricts(provinceId);
}

export async function getLocalLevels(districtId: number): Promise<LocalLevelDto[]> {
  if (!(await exists('districts', districtId))) throw new AppError('NOT_FOUND', 'District not found');
  return listLocalLevels(districtId);
}

export async function getWards(localLevelId: number): Promise<WardDto[]> {
  if (!(await exists('local_levels', localLevelId))) throw new AppError('NOT_FOUND', 'Local level not found');
  return listWards(localLevelId);
}
