'use client';

import { useQuery } from '@tanstack/react-query';
import { getDistrictShapes } from '@/api/geo.api';
import { getMapStats, getSummary, type MapStatsParams } from '@/api/stats.api';
import { queryKeys } from './queryKeys';

export const useMapStats = (params: MapStatsParams = {}) =>
  useQuery({
    queryKey: queryKeys.stats.map(params),
    queryFn: () => getMapStats(params),
    placeholderData: (previous) => previous, // keep the old colours while a new metric/filter loads
  });

export const useSummary = () => useQuery({ queryKey: queryKeys.stats.summary, queryFn: getSummary });

/** Boundaries never change while the app runs: load once, keep forever (staleTime: Infinity). */
export const useDistrictShapes = () =>
  useQuery({ queryKey: queryKeys.districtShapes, queryFn: getDistrictShapes, staleTime: Infinity });
