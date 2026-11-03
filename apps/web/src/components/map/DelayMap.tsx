'use client';

import { MAP_METRICS, REQUEST_STATUSES, SERVICE_TYPE_CODES, type MapMetric } from '@sewa/shared';
import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';
import type { MapStatsParams } from '@/api/stats.api';
import { Button, Card, DateField, QueryState, SelectField, Skeleton, Spinner, STICKY_HEAD, TableCard } from '@/components/common';
import { useDistricts, useServiceTypes } from '@/hooks/useReference';
import { useDistrictShapes, useMapStats } from '@/hooks/useStats';
import { NO_DATA, colorFor, colorForClass, higherIsBetter, quantileBreaks } from '@/lib/choropleth';
import { formatNumber } from '@/lib/format';
import { pickName, useI18n, type Lang } from '@/lib/i18n';

// Leaflet needs `window`: load the map part only in the browser, with a placeholder meanwhile.
const DistrictMap = dynamic(() => import('./DistrictMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-surface">
      <Spinner />
    </div>
  ),
});

const CREDIT = 'Boundaries: <a href="https://github.com/Acesmndr/nepal-geojson">Acesmndr/nepal-geojson</a> (MIT), simplified';

/** How one metric value is written: counts as numbers, rate as %, days with one decimal. */
export function formatMetric(metric: MapMetric, value: number | null, lang: Lang): string {
  if (value === null) return '—';
  if (metric === 'onTimeRate') return `${formatNumber(Math.round(value * 100), lang)}%`;
  if (metric === 'avgDaysToClose') return formatNumber(Math.round(value * 10) / 10, lang);
  return formatNumber(value, lang);
}

/**
 * The national service-delay map (PRD F8): district choropleth from GET /stats/map.
 *   compact (home): metric toggle + map + legend
 *   full (/stats):  + filters (service, status, dates), side panel, "view as table"
 * Data flow: filters → useMapStats → value per districtId → colour → DistrictMap.
 * The table is also the accessible version: the same numbers, readable by keyboard and screen reader.
 */
export function DelayMap({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
  const { t, lang } = useI18n();
  const full = variant === 'full';
  const [metric, setMetric] = useState<MapMetric>('overdue');
  const [filters, setFilters] = useState<Omit<MapStatsParams, 'metric' | 'level'>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const shapes = useDistrictShapes();
  const stats = useMapStats({ metric, level: 'district', ...filters });
  const districts = useDistricts();
  const services = useServiceTypes();

  const nameOf = useMemo(() => new Map((districts.data ?? []).map((d) => [d.id, pickName(d, lang)])), [districts.data, lang]);
  const areaById = useMemo(() => new Map((stats.data?.areas ?? []).map((a) => [a.areaId, a])), [stats.data]);
  const breaks = useMemo(() => quantileBreaks((stats.data?.areas ?? []).flatMap((a) => (a.value === null ? [] : [a.value]))), [stats.data]);

  // Stable functions (useCallback), so DistrictMap re-colours only when the data really changed.
  const colorOf = useCallback((id: number) => colorFor(areaById.get(id)?.value, breaks, metric), [areaById, breaks, metric]);
  const labelOf = useCallback(
    (id: number) => `${nameOf.get(id) ?? id}: ${formatMetric(metric, areaById.get(id)?.value ?? null, lang)}`,
    [nameOf, areaById, metric, lang],
  );

  // Ranking: worst first (for on-time rate, the LOWEST is worst). Districts with no value go last.
  const ranked = useMemo(() => {
    const sign = higherIsBetter(metric) ? 1 : -1;
    return [...(stats.data?.areas ?? [])].sort((a, b) => (a.value === null ? 1 : b.value === null ? -1 : sign * (a.value - b.value)));
  }, [stats.data, metric]);
  const selected = selectedId === null ? undefined : areaById.get(selectedId);
  const rank = selected ? ranked.findIndex((a) => a.areaId === selected.areaId) + 1 : 0;

  const setFilter = (key: keyof typeof filters, value: string) => setFilters((f) => ({ ...f, [key]: value || undefined }));

  return (
    <div className="flex flex-col gap-4">
      {/* Metric toggle: buttons with aria-pressed, so a screen reader says which one is on. */}
      <div role="group" aria-label={t('map.metric')} className="flex flex-wrap gap-2">
        {MAP_METRICS.map((m) => (
          <Button key={m} variant={m === metric ? 'primary' : 'secondary'} aria-pressed={m === metric} onClick={() => setMetric(m)}>
            {t(`map.metric.${m}`)}
          </Button>
        ))}
      </div>

      {full && (
        <form aria-label={t('map.filters')} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => e.preventDefault()}>
          <SelectField
            label={t('citizen.service')}
            value={filters.serviceType ?? ''}
            onChange={(v) => setFilter('serviceType', v)}
            options={[
              { value: '', label: t('staff.all') },
              ...SERVICE_TYPE_CODES.map((code) => ({
                value: code,
                label: pickName(services.data?.find((s) => s.code === code) ?? { nameEn: code, nameNe: code }, lang),
              })),
            ]}
          />
          <SelectField
            label={t('citizen.status')}
            value={filters.status ?? ''}
            onChange={(v) => setFilter('status', v)}
            options={[{ value: '', label: t('staff.all') }, ...REQUEST_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))]}
          />
          <DateField label={t('map.from')} value={filters.from ?? ''} max={filters.to} onChange={(v) => setFilter('from', v)} />
          <DateField label={t('map.to')} value={filters.to ?? ''} min={filters.from} onChange={(v) => setFilter('to', v)} />
        </form>
      )}

      <QueryState
        isLoading={shapes.isLoading || stats.isLoading}
        error={shapes.error ?? stats.error}
        onRetry={() => (shapes.error ? shapes.refetch() : stats.refetch())}
        // Same height as the map below, so nothing jumps when it appears.
        skeleton={<Skeleton className="h-[420px] rounded-xl sm:h-[480px]" />}
      />

      {shapes.data && stats.data && (
        <>
          <div className="flex flex-col gap-4 lg:flex-row">
            <figure className="m-0 flex flex-[3_1_0] flex-col gap-2">
              <div className={`h-[420px] overflow-hidden rounded-xl border border-line sm:h-[480px] ${stats.isPlaceholderData ? 'opacity-70' : ''}`}>
                <DistrictMap shapes={shapes.data} colorOf={colorOf} labelOf={labelOf} selectedId={selectedId} onSelect={setSelectedId} credit={CREDIT} />
              </div>
              <figcaption className="text-sm text-muted">{t(full ? 'map.captionFull' : 'map.caption')}</figcaption>
            </figure>

            {full && (
              <Card as="aside" aria-live="polite" aria-label={t('map.details')} className="flex flex-[1_1_0] flex-col gap-2 text-sm lg:max-w-xs">
                {selected ? (
                  <>
                    <h3 className="text-lg font-bold text-primary">{nameOf.get(selected.areaId)}</h3>
                    <p>
                      <span className="text-muted">{t(`map.metric.${metric}`)}:</span> <strong className="text-base">{formatMetric(metric, selected.value, lang)}</strong>
                    </p>
                    <p>
                      <span className="text-muted">{t('map.requests')}:</span> {formatNumber(selected.total, lang)}
                    </p>
                    {selected.value !== null && (
                      <p>
                        <span className="text-muted">{t('map.rank')}:</span> {formatNumber(rank, lang)} / {formatNumber(ranked.length, lang)}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-muted">{t('map.clickHint')}</p>
                )}
              </Card>
            )}
          </div>

          <Legend metric={metric} breaks={breaks} lang={lang} />

          {full && (
            <div className="flex flex-col gap-3">
              <Button variant="secondary" className="self-start" aria-expanded={showTable} onClick={() => setShowTable((s) => !s)}>
                {t(showTable ? 'map.hideTable' : 'map.showTable')}
              </Button>
              {showTable && (
                <TableCard label={t(`map.metric.${metric}`)}>
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <caption className="sr-only">{t(`map.metric.${metric}`)}</caption>
                    <thead className={STICKY_HEAD}>
                      <tr>
                        <th scope="col" className="p-3">#</th>
                        <th scope="col" className="p-3">{t('home.district')}</th>
                        <th scope="col" className="p-3">{t(`map.metric.${metric}`)}</th>
                        <th scope="col" className="p-3">{t('map.requests')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((a, i) => (
                        <tr key={a.areaId} className="border-t border-line">
                          <td className="p-3 text-muted">{formatNumber(i + 1, lang)}</td>
                          <th scope="row" className="p-3 font-medium">
                            <button type="button" className="text-left font-semibold text-primary underline-offset-2 hover:underline" onClick={() => setSelectedId(a.areaId)}>
                              {nameOf.get(a.areaId) ?? a.areaId}
                            </button>
                          </th>
                          <td className="p-3 font-semibold">{formatMetric(metric, a.value, lang)}</td>
                          <td className="p-3">{formatNumber(a.total, lang)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableCard>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Colour key: one swatch per class with its range, plus "no data". Text, not colour alone, carries meaning. */
function Legend({ metric, breaks, lang }: { metric: MapMetric; breaks: number[]; lang: Lang }) {
  const { t } = useI18n();
  const fmt = (v: number) => formatMetric(metric, v, lang);
  // Class i covers [breaks[i-1], breaks[i]); the first has no lower bound, the last no upper bound.
  const labels =
    breaks.length === 0
      ? [t('map.allSame')]
      : [`< ${fmt(breaks[0]!)}`, ...breaks.slice(1).map((b, i) => `${fmt(breaks[i]!)} – ${fmt(b)}`), `≥ ${fmt(breaks.at(-1)!)}`];
  return (
    <div aria-label={t('map.legend')} role="group" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <span className="font-semibold">{t(higherIsBetter(metric) ? 'map.legendBetter' : 'map.legendWorse')}</span>
      {labels.map((label, i) => (
        <span key={i} className="flex items-center gap-1">
          <span aria-hidden="true" className="inline-block h-4 w-6 rounded-sm border border-line" style={{ background: colorForClass(i, breaks, metric) }} />
          {label}
        </span>
      ))}
      <span className="flex items-center gap-1">
        <span aria-hidden="true" className="inline-block h-4 w-6 rounded-sm border border-line" style={{ background: NO_DATA }} />
        {t('map.noData')}
      </span>
    </div>
  );
}
