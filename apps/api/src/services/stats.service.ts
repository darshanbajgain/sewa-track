import type { MapMetric, MapQuery, MapResponseDto, StatsTotalsDto, SummaryDto } from '@sewa/shared';
import { AppError } from '../errors.js';
import {
  countByArea,
  countByProvince,
  countByServiceType,
  countByStatus,
  countByWard,
  countTotals,
  type Counters,
} from '../repositories/stats.repository.js';
import type { SessionUser } from '../security/token.js';

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

/** Turn raw counters into the public totals shape. Rates are 0..1 (3 decimals); days 1 decimal. */
function toTotals(c: Counters): StatsTotalsDto {
  return {
    total: c.total,
    pending: c.pending,
    overdue: c.overdue,
    closed: c.closed,
    onTimeRate: c.closed > 0 ? round(c.closedOnTime / c.closed, 3) : null,
    avgDaysToClose: c.avgDaysToClose === null ? null : round(c.avgDaysToClose, 1),
  };
}

/** The value shown on the map for one area: just PICK the metric from the counters (no SQL involved). */
function pickMetric(metric: MapMetric, c: Counters): number | null {
  const t = toTotals(c);
  switch (metric) {
    case 'overdue':
      return t.overdue;
    case 'pending':
      return t.pending;
    case 'onTimeRate':
      return t.onTimeRate;
    case 'avgDaysToClose':
      return t.avgDaysToClose;
  }
}

/** Add up per-area counters into one. The average is weighted by how many requests closed in each area. */
function sumCounters(rows: Counters[]): Counters {
  const sum = (key: 'total' | 'pending' | 'overdue' | 'closed' | 'closedOnTime') => rows.reduce((s, r) => s + r[key], 0);
  const closed = sum('closed');
  const weightedDays = rows.reduce((s, r) => s + (r.avgDaysToClose ?? 0) * r.closed, 0);
  return {
    total: sum('total'),
    pending: sum('pending'),
    overdue: sum('overdue'),
    closed,
    closedOnTime: sum('closedOnTime'),
    avgDaysToClose: closed > 0 ? weightedDays / closed : null,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * National delay map (PRD F8). Public: aggregates only. Areas with no matching requests are simply
 * absent (the map draws them as "no data").
 */
export async function getMapStats(q: MapQuery, now: Date = new Date()): Promise<MapResponseDto> {
  const from = q.from ? new Date(`${q.from}T00:00:00Z`) : undefined;
  const toExclusive = q.to ? new Date(new Date(`${q.to}T00:00:00Z`).getTime() + DAY_MS) : undefined; // "to" is inclusive
  if (from && toExclusive && from >= toExclusive) throw new AppError('VALIDATION_ERROR', '"from" must be on or before "to"');

  const rows = await countByArea({ ...q, from, toExclusive, now });
  return {
    level: q.level,
    metric: q.metric,
    areas: rows.map((r) => ({ areaId: r.areaId, value: pickMetric(q.metric, r), total: r.total })),
    totals: toTotals(sumCounters(rows)),
  };
}

/** Staff report (PRD F7): palika admin → own palika (per ward); system admin → Nepal (per province). */
export async function getSummary(user: SessionUser, now: Date = new Date()): Promise<SummaryDto> {
  const localLevelId = user.role === 'PALIKA_ADMIN' ? user.localLevelId : null;
  if (user.role === 'PALIKA_ADMIN' && localLevelId === null) throw new AppError('FORBIDDEN', 'No palika assigned');

  const [totals, byStatus, byServiceType, byArea] = await Promise.all([
    countTotals(localLevelId, now),
    countByStatus(localLevelId),
    countByServiceType(localLevelId),
    localLevelId === null ? countByProvince(now) : countByWard(localLevelId, now),
  ]);

  return {
    scope: localLevelId === null ? { kind: 'national' } : { kind: 'palika', localLevelId },
    totals: toTotals(totals),
    byStatus,
    byServiceType,
    byArea,
  };
}
