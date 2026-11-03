'use client';

import { PageTitle } from '@/components/common';
import { DelayMap } from '@/components/map/DelayMap';
import { useI18n } from '@/lib/i18n';

/** The national delay map inside the palika portal (same aggregates as the public /stats page). */
export default function PalikaMapPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <PageTitle title={t('map.title')} intro={t('map.intro')} />
      <DelayMap variant="full" />
    </div>
  );
}
