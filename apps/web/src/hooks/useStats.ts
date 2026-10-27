'use client';

import { useQuery } from '@tanstack/react-query';
import { getMapStats, getSummary, type MapStatsParams } from '@/api/stats.api';
import { queryKeys } from './queryKeys';

export const useMapStats = (params: MapStatsParams = {}) =>
  useQuery({ queryKey: queryKeys.stats.map(params), queryFn: () => getMapStats(params) });

export const useSummary = () => useQuery({ queryKey: queryKeys.stats.summary, queryFn: getSummary });
