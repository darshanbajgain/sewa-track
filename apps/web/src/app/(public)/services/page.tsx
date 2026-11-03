'use client';

import { Badge, Card, PageTitle, QueryState } from '@/components/common';
import { pickName, useI18n } from '@/lib/i18n';
import { useServiceTypes } from '@/hooks/useReference';

/** Service catalog (PRD F1): documents, demo fee and promised days for each service. */
export default function ServicesPage() {
  const { t, lang } = useI18n();
  const services = useServiceTypes();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <PageTitle title={t('services.title')} intro={t('services.intro')} />
      <p className="self-start rounded-md bg-warn-soft px-3 py-2 text-sm font-medium text-warn">{t('services.demoValues')}</p>

      <QueryState isLoading={services.isLoading} error={services.error} onRetry={() => services.refetch()} />

      <div className="grid gap-4 md:grid-cols-2">
        {(services.data ?? []).map((s) => (
          <Card as="article" key={s.code} className="flex flex-col gap-3">
            <h2 id={s.code} className="scroll-mt-4 text-xl font-bold text-primary">
              {pickName(s, lang)}
            </h2>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded bg-surface px-2 py-1">
                {t('services.fee')}: {s.feeNpr === 0 ? t('services.free') : `NPR ${s.feeNpr}`}
              </span>
              <span className="rounded bg-surface px-2 py-1">
                {s.serviceDays} {s.serviceDays === 1 ? t('services.day') : t('services.days')}
              </span>
              {s.requiresFieldVerification && <Badge tone="info">{t('services.fieldVisit')}</Badge>}
            </div>
            <div>
              <h3 className="mb-1 text-sm font-semibold">{t('services.documents')}</h3>
              <ul className="list-disc pl-5 text-sm leading-7 text-ink">
                {s.requiredDocuments.map((d) => (
                  <li key={d.nameEn}>{pickName(d, lang)}</li>
                ))}
              </ul>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
