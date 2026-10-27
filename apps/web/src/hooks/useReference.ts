'use client';

import { useQuery } from '@tanstack/react-query';
import { getDistricts, getLocalLevels, getProvinces, getServiceTypes, getWards } from '@/api/reference.api';
import { queryKeys } from './queryKeys';

/** Reference data rarely changes: keep it fresh for an hour (same as the API's Cache-Control). */
const HOUR = 60 * 60_000;

export const useServiceTypes = () => useQuery({ queryKey: queryKeys.serviceTypes, queryFn: getServiceTypes, staleTime: HOUR });

export const useProvinces = () => useQuery({ queryKey: queryKeys.provinces, queryFn: getProvinces, staleTime: HOUR });

export const useDistricts = (provinceId?: number) =>
  useQuery({ queryKey: queryKeys.districts(provinceId), queryFn: () => getDistricts(provinceId), staleTime: HOUR });

/** Cascading dropdowns: each list only loads once its parent is chosen (`enabled`). */
export const useLocalLevels = (districtId: number | undefined) =>
  useQuery({
    queryKey: queryKeys.localLevels(districtId ?? 0),
    queryFn: () => getLocalLevels(districtId!),
    enabled: districtId !== undefined,
    staleTime: HOUR,
  });

export const useWards = (localLevelId: number | undefined) =>
  useQuery({
    queryKey: queryKeys.wards(localLevelId ?? 0),
    queryFn: () => getWards(localLevelId!),
    enabled: localLevelId !== undefined,
    staleTime: HOUR,
  });
