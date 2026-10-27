import type { MapLevel, MapMetric, MapResponseDto, RequestStatus, ServiceTypeCode, SummaryDto } from '@sewa/shared';
import { client } from './client';
import { ENDPOINTS } from './endpoints';

/** Aggregate statistics for the delay map (public) and staff reports. */

export interface MapStatsParams {
  level?: MapLevel;
  metric?: MapMetric;
  serviceType?: ServiceTypeCode;
  status?: RequestStatus;
  from?: string; // YYYY-MM-DD
  to?: string;
  parentId?: number;
}

export async function getMapStats(params: MapStatsParams = {}): Promise<MapResponseDto> {
  const { data } = await client.get<MapResponseDto>(ENDPOINTS.stats.map, { params });
  return data;
}

export async function getSummary(): Promise<SummaryDto> {
  const { data } = await client.get<SummaryDto>(ENDPOINTS.stats.summary);
  return data;
}
