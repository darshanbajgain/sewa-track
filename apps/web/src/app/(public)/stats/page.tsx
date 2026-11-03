'use client';

import { PageTitle } from '@/components/common';
import { DelayMap } from '@/components/map/DelayMap';
import { useI18n } from '@/lib/i18n';

/**
 * Public national service-delay map (PRD F8, `/stats`). Aggregates only: GET /stats/map never returns
 * individual requests, so this page is safe without login. Admins use the same page (drill-down to
 * palika is planned for M3).
 */
export default function StatsPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <PageTitle title={t('map.title')} intro={t('map.intro')} />
      <DelayMap variant="full" />
      <p className="text-sm text-muted">{t('home.demoData')}</p>
    </div>
  );
}
