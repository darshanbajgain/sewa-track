import { z } from 'zod';
import { requestStatusSchema, serviceTypeCodeSchema, type RequestStatus, type ServiceTypeCode } from './enums.js';

/**
 * Statistics for the national service-delay map (PRD F8) and staff reports (PRD F7).
 * Only AGGREGATES (counts, rates, averages): never individual requests or personal data.
 */

export const MAP_LEVELS = ['district', 'local_level'] as const;
export const MAP_METRICS = ['overdue', 'onTimeRate', 'pending', 'avgDaysToClose'] as const;
export type MapLevel = (typeof MAP_LEVELS)[number];
export type MapMetric = (typeof MAP_METRICS)[number];

/** GET /stats/map query. `level` and `metric` come from fixed lists (never pasted into SQL). */
export const mapQuerySchema = z.object({
  level: z.enum(MAP_LEVELS).default('district'),
  metric: z.enum(MAP_METRICS).default('overdue'),
  serviceType: serviceTypeCodeSchema.optional(),
  status: requestStatusSchema.optional(),
  from: z.iso.date().optional(), // "2026-10-01" (inclusive, by submission date, UTC)
  to: z.iso.date().optional(), // "2026-10-31" (inclusive)
  // Narrow the areas: for level=district a province id, for level=local_level a district id.
  parentId: z.coerce.number().int().positive().optional(),
});
export type MapQuery = z.infer<typeof mapQuerySchema>;

/** One area on the map. `value` is the chosen metric; null when it can't be computed (e.g. nothing closed yet). */
export interface MapAreaDto {
  areaId: number;
  value: number | null;
  total: number; // requests in this area that match the filters
}

export interface StatsTotalsDto {
  total: number;
  pending: number; // open (not final)
  overdue: number; // open AND past submitted_at + service days
  closed: number;
  onTimeRate: number | null; // closed within service days ÷ all closed (0..1)
  avgDaysToClose: number | null;
}

export interface MapResponseDto {
  level: MapLevel;
  metric: MapMetric;
  areas: MapAreaDto[];
  totals: StatsTotalsDto; // the same filters, summed over all areas (the home page's national numbers)
}

/** GET /stats/summary (palika admin: own palika · system admin: Nepal). */
export interface SummaryDto {
  scope: { kind: 'palika'; localLevelId: number } | { kind: 'national' };
  totals: StatsTotalsDto;
  byStatus: { status: RequestStatus; count: number }[];
  byServiceType: { code: ServiceTypeCode; count: number }[];
  /** Palika admin: one row per ward. System admin: one row per province. */
  byArea: { areaId: number; label: string; pending: number; overdue: number }[];
}
