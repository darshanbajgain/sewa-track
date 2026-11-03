'use client';

import Link from 'next/link';
import { ButtonLink, Card, QueryState } from '@/components/common';
import { DelayMap } from '@/components/map/DelayMap';
import { pickName, useI18n } from '@/lib/i18n';
import { useDistricts, useServiceTypes } from '@/hooks/useReference';
import { useMapStats } from '@/hooks/useStats';
import { usePageTitle } from '@/lib/usePageTitle';

/**
 * Home (PRD F8): leads with the national delay picture. Numbers come live from GET /stats/map
 * (its `totals`), then the district delay map, then the most-overdue districts (full map: /stats).
 */
export default function HomePage() {
  const { t, lang } = useI18n();
  usePageTitle(undefined); // home: just the site name
  const stats = useMapStats({ metric: 'overdue' });
  const districts = useDistricts();
  const services = useServiceTypes();

  const nameOf = new Map((districts.data ?? []).map((d) => [d.id, pickName(d, lang)]));
  const topOverdue = [...(stats.data?.areas ?? [])].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 8);
  const totals = stats.data?.totals;
  // 'nu-deva' = Devanagari digits (३४,७२४) in Nepali; the browser formats them, no library needed.
  const fmt = (n: number) => n.toLocaleString(lang === 'ne' ? 'ne-NP-u-nu-deva' : 'en-US');

  return (
    <>
      {/* Hero */}
      <section className="bg-primary-soft">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-12">
          <h1 className="max-w-3xl text-4xl font-bold leading-tight text-primary">{t('home.title')}</h1>
          <p className="max-w-3xl text-lg text-ink">{t('home.subtitle')}</p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/citizen/apply" size="lg">
              {t('home.apply')}
            </ButtonLink>
            <ButtonLink href="/track" variant="secondary" size="lg">
              {t('home.track')}
            </ButtonLink>
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-10">
        {/* National numbers */}
        <section aria-labelledby="numbers" className="flex flex-col gap-4">
          <h2 id="numbers" className="text-2xl font-bold">
            {t('home.numbers')}
          </h2>
          <QueryState isLoading={stats.isLoading} error={stats.error} onRetry={() => stats.refetch()} />
          {totals && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <p className="text-sm text-muted">{t('home.open')}</p>
                <p className="text-3xl font-bold text-primary">{fmt(totals.pending)}</p>
              </Card>
              <Card className="border-accent/40">
                <p className="text-sm text-muted">{t('home.overdue')}</p>
                <p className="text-3xl font-bold text-accent">{fmt(totals.overdue)}</p>
              </Card>
              <Card>
                <p className="text-sm text-muted">{t('home.onTime')}</p>
                <p className="text-3xl font-bold text-ok">
                  {totals.onTimeRate === null ? '—' : `${Math.round(totals.onTimeRate * 100)}%`}
                </p>
              </Card>
            </div>
          )}
          <p className="text-sm text-muted">{t('home.demoData')}</p>
        </section>

        {/* The headline: where are requests late? */}
        <section aria-labelledby="map" className="flex flex-col gap-4">
          <h2 id="map" className="text-2xl font-bold">
            {t('map.title')}
          </h2>
          <DelayMap variant="compact" />
        </section>

        {/* Most overdue districts (table fallback for the map) */}
        <section aria-labelledby="overdue" className="flex flex-col gap-4">
          <h2 id="overdue" className="text-2xl font-bold">
            {t('home.mostOverdue')}
          </h2>
          {topOverdue.length > 0 && (
            <div className="relative overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="bg-surface">
                  <tr>
                    <th scope="col" className="p-3">{t('home.district')}</th>
                    <th scope="col" className="p-3">{t('home.overdueCol')}</th>
                    <th scope="col" className="p-3">{t('home.totalCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {topOverdue.map((a) => (
                    <tr key={a.areaId} className="border-t border-line">
                      <td className="p-3 font-medium">{nameOf.get(a.areaId) ?? a.areaId}</td>
                      <td className="p-3 font-semibold text-accent">{fmt(a.value ?? 0)}</td>
                      <td className="p-3">{fmt(a.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Link href="/stats" className="self-start font-semibold text-primary">
            {t('home.fullMap')} →
          </Link>
        </section>

        {/* How it works */}
        <section aria-labelledby="how" className="flex flex-col gap-4">
          <h2 id="how" className="text-2xl font-bold">
            {t('home.howTitle')}
          </h2>
          <ol className="grid gap-4 sm:grid-cols-3">
            {(['home.step1', 'home.step2', 'home.step3'] as const).map((key, i) => (
              <li key={key} className="flex gap-3 rounded-xl border border-line p-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-white">{i + 1}</span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Services preview */}
        <section aria-labelledby="services" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="services" className="text-2xl font-bold">
              {t('home.servicesTitle')}
            </h2>
            <Link href="/services" className="font-semibold text-primary">
              {t('home.allServices')} →
            </Link>
          </div>
          <QueryState isLoading={services.isLoading} error={services.error} onRetry={() => services.refetch()} />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(services.data ?? []).map((s) => (
              <li key={s.code}>
                <Link href={`/services#${s.code}`} className="flex h-full flex-col gap-1 rounded-xl border border-line p-4 no-underline hover:border-primary hover:bg-primary-soft">
                  <span className="font-semibold text-primary">{pickName(s, lang)}</span>
                  <span className="text-sm text-muted">
                    {s.feeNpr === 0 ? t('services.free') : `NPR ${s.feeNpr}`} · {s.serviceDays} {s.serviceDays === 1 ? t('services.day') : t('services.days')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
