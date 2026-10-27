'use client';

import type { DistrictDto, MapResponseDto, ServiceTypeDto } from '@sewa/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/**
 * Data hooks: one per API resource. TanStack Query caches by `queryKey`, so two components asking
 * for the service types share one request, and switching pages back and forth doesn't refetch.
 */

export const useServiceTypes = () =>
  useQuery({
    queryKey: ['service-types'],
    queryFn: () => api<{ serviceTypes: ServiceTypeDto[] }>('/service-types').then((r) => r.serviceTypes),
    staleTime: 60 * 60_000, // reference data: fresh for an hour (same as the API's Cache-Control)
  });

export const useDistricts = () =>
  useQuery({
    queryKey: ['districts'],
    queryFn: () => api<{ districts: DistrictDto[] }>('/locations/districts').then((r) => r.districts),
    staleTime: 60 * 60_000,
  });

export const useMapStats = (params: Record<string, string> = {}) =>
  useQuery({
    queryKey: ['stats-map', params],
    queryFn: () => api<MapResponseDto>(`/stats/map?${new URLSearchParams(params)}`),
  });
