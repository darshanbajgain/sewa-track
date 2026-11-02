import type { MapStatsParams } from '@/api/stats.api';
import type { QueueFilters } from '@/api/requests.api';
import type { UserListParams } from '@/api/admin.api';

/**
 * Every TanStack Query cache key, built in ONE place ("query key factory").
 *
 * Keys are arrays, from general to specific: ['requests', 'detail', id]. That makes invalidation
 * easy and safe: invalidating ['requests'] refreshes the queue, my requests AND every detail at once,
 * because all their keys start with 'requests'. No hand-typed key can be misspelled.
 */
export const queryKeys = {
  me: ['me'] as const,

  serviceTypes: ['reference', 'service-types'] as const,
  provinces: ['reference', 'provinces'] as const,
  districts: (provinceId?: number) => ['reference', 'districts', provinceId ?? 'all'] as const,
  localLevels: (districtId: number) => ['reference', 'local-levels', districtId] as const,
  wards: (localLevelId: number) => ['reference', 'wards', localLevelId] as const,

  requests: {
    all: ['requests'] as const,
    mine: ['requests', 'mine'] as const,
    queue: (filters: QueueFilters) => ['requests', 'queue', filters] as const,
    detail: (id: string) => ['requests', 'detail', id] as const,
  },

  tracking: (code: string) => ['tracking', code] as const,

  districtShapes: ['geo', 'districts'] as const,

  admin: {
    users: (query: UserListParams) => ['admin', 'users', query] as const,
    all: ['admin'] as const,
  },

  stats: {
    all: ['stats'] as const,
    map: (params: MapStatsParams) => ['stats', 'map', params] as const,
    summary: ['stats', 'summary'] as const,
  },
};
