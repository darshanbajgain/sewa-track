import type { DistrictDto, LocalLevelDto, ProvinceDto, ServiceTypeDto, WardDto } from '@sewa/shared';
import { client } from './client';
import { ENDPOINTS } from './endpoints';

/** Public reference data: service catalog and the location hierarchy (for the Apply form). */

export async function getServiceTypes(): Promise<ServiceTypeDto[]> {
  const { data } = await client.get<{ serviceTypes: ServiceTypeDto[] }>(ENDPOINTS.reference.serviceTypes);
  return data.serviceTypes;
}

export async function getProvinces(): Promise<ProvinceDto[]> {
  const { data } = await client.get<{ provinces: ProvinceDto[] }>(ENDPOINTS.reference.provinces);
  return data.provinces;
}

/** All districts, or those of one province. `params` becomes the query string (?provinceId=3). */
export async function getDistricts(provinceId?: number): Promise<DistrictDto[]> {
  const { data } = await client.get<{ districts: DistrictDto[] }>(ENDPOINTS.reference.districts, { params: { provinceId } });
  return data.districts;
}

export async function getLocalLevels(districtId: number): Promise<LocalLevelDto[]> {
  const { data } = await client.get<{ localLevels: LocalLevelDto[] }>(ENDPOINTS.reference.localLevels, { params: { districtId } });
  return data.localLevels;
}

export async function getWards(localLevelId: number): Promise<WardDto[]> {
  const { data } = await client.get<{ wards: WardDto[] }>(ENDPOINTS.reference.wards, { params: { localLevelId } });
  return data.wards;
}
