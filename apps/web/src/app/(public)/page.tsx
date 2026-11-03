'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge, ButtonLink, Card, QueryState } from '@/components/common';
import { useServiceTypes } from '@/hooks/useReference';
import { useMapStats } from '@/hooks/useStats';
import { pickName, useI18n, type MessageKey } from '@/lib/i18n';
import { usePageTitle } from '@/lib/usePageTitle';

/**
 * Home (PRD F8, simplified 2026-11-03 by the owner): a short page that points to the right place.
 *   1. hero: what this is + Apply / Track a request / Delay map · beside it the national numbers (GET /stats/map totals)
 *   2. the services, each with "Apply for this" (→ the apply form with that service chosen) · 3. how it works
 * The delay map and tracking have their own pages (/stats, /track), so they are not repeated here.
 */
export default function HomePage() {
  const { t, lang } = useI18n();
  usePageTitle(undefined); // home: just the site name
  const stats = useMapStats({ metric: 'overdue' });
  const services = useServiceTypes();
  const totals = stats.data?.totals;
  // 'nu-deva' = Devanagari digits (३४,७२४) in Nepali; the browser formats them, no library needed.
  const fmt = (n: number) => n.toLocaleString(lang === 'ne' ? 'ne-NP-u-nu-deva' : 'en-US');

  return (
    <>
      {/* 1. Hero */}
      <section className="border-b border-line bg-primary-soft">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 lg:grid-cols-[1.5fr_1fr] lg:items-center">
          <div className="flex flex-col gap-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">{t('home.eyebrow')}</p>
            <h1 className="text-4xl font-bold leading-tight text-primary sm:text-5xl">{t('home.title')}</h1>
            <p className="max-w-2xl text-lg">{t('home.subtitle')}</p>
            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink href="/citizen/apply" size="lg">
                {t('home.apply')}
              </ButtonLink>
              <ButtonLink href="/track" variant="secondary" size="lg">
                {t('home.trackRequest')}
              </ButtonLink>
              <ButtonLink href="/stats" variant="ghost" size="lg">
                {t('home.seeMap')} →
              </ButtonLink>
            </div>
          </div>

          <Card as="section" aria-labelledby="numbers" className="flex flex-col gap-4 shadow-sm">
            <h2 id="numbers" className="text-lg font-bold">
              {t('home.numbers')}
            </h2>
            <QueryState isLoading={stats.isLoading} error={stats.error} onRetry={() => stats.refetch()} />
            {totals && (
              <dl className="flex flex-col divide-y divide-line">
                <Stat label={t('home.overdue')} value={fmt(totals.overdue)} className="text-accent" />
                <Stat label={t('home.open')} value={fmt(totals.pending)} className="text-primary" />
                <Stat label={t('home.onTime')} value={totals.onTimeRate === null ? '—' : `${Math.round(totals.onTimeRate * 100)}%`} className="text-ok" />
              </dl>
            )}
            <p className="text-xs text-muted">{t('home.demoData')}</p>
          </Card>
        </div>
      </section>

      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-12">
        {/* 2. Services */}
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
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(services.data ?? []).map((s) => (
              <li key={s.code} className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
                <span className="text-lg font-semibold text-primary">{pickName(s, lang)}</span>
                <span className="flex flex-wrap gap-2">
                  <Badge>{s.feeNpr === 0 ? t('services.free') : `NPR ${fmt(s.feeNpr)}`}</Badge>
                  <Badge>
                    {fmt(s.serviceDays)} {s.serviceDays === 1 ? t('services.day') : t('services.days')}
                  </Badge>
                  {s.requiresFieldVerification && <Badge tone="info">{t('services.fieldVisit')}</Badge>}
                </span>
                <span className="text-sm text-muted">
                  {fmt(s.requiredDocuments.length)} {t('home.docsNeeded')}
                </span>
                {/* A visitor is asked to log in first and then lands on the form with this service chosen. */}
                <span className="mt-auto flex flex-wrap items-center gap-3 pt-1">
                  <ButtonLink href={`/citizen/apply?service=${s.code}`}>
                    {t('services.applyFor')}
                    <span className="sr-only">: {pickName(s, lang)}</span>
                  </ButtonLink>
                  <Link href={`/services#${s.code}`} className="text-sm font-semibold text-primary">
                    {t('home.details')}
                    <span className="sr-only">: {pickName(s, lang)}</span>
                  </Link>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">{t('services.demoValues')}</p>
        </section>

        {/* 3. How it works */}
        <section aria-labelledby="how" className="flex flex-col gap-4">
          <h2 id="how" className="text-2xl font-bold">
            {t('home.howTitle')}
          </h2>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
                <span className="flex items-center gap-3">
                  <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-primary">
                    {step.icon}
                  </span>
                  <span className="text-sm font-semibold text-muted">
                    {t('home.stepWord')} {fmt(i + 1)}
                  </span>
                </span>
                <span className="font-bold">{t(step.title)}</span>
                <span className="text-sm text-muted">{t(step.body)}</span>
              </li>
            ))}
          </ol>
        </section>

      </div>
    </>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`text-3xl font-bold ${className}`}>{value}</dd>
    </div>
  );
}

/** Simple line icons (drawn here, 24×24, stroke = text colour). Decorative: the step text says it all. */
const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {path}
  </svg>
);

const STEPS: { icon: ReactNode; title: MessageKey; body: MessageKey }[] = [
  {
    // a list
    icon: icon(<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />),
    title: 'home.step1Title',
    body: 'home.step1Body',
  },
  {
    // an arrow going up into a tray (upload)
    icon: icon(<path d="M12 15V4M7 9l5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />),
    title: 'home.step2Title',
    body: 'home.step2Body',
  },
  {
    // a magnifying glass
    icon: icon(<path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5" />),
    title: 'home.step3Title',
    body: 'home.step3Body',
  },
  {
    // a tick in a circle
    icon: icon(<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6" />),
    title: 'home.step4Title',
    body: 'home.step4Body',
  },
];
