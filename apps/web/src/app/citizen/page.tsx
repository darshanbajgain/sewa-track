'use client';

import Link from 'next/link';
import { ButtonLink, Card, PageTitle, QueryState, SkeletonTable, STICKY_HEAD, TableCard } from '@/components/common';
import { OverdueBadge, StatusBadge } from '@/components/requests/StatusBadge';
import { useMyRequests } from '@/hooks/useRequests';
import { useServiceTypes } from '@/hooks/useReference';
import { formatDate } from '@/lib/format';
import { pickName, useI18n } from '@/lib/i18n';

/** My requests (PRD F4): the citizen's own requests, newest first (the API only returns their own). */
export default function MyRequestsPage() {
  const { t, lang } = useI18n();
  const requests = useMyRequests();
  const services = useServiceTypes();
  const serviceName = new Map((services.data ?? []).map((s) => [s.code, pickName(s, lang)]));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle title={t('citizen.myTitle')} intro={t('citizen.myIntro')} />
        <ButtonLink href="/citizen/apply" size="lg">
          {t('citizen.new')}
        </ButtonLink>
      </div>

      <QueryState isLoading={requests.isLoading} error={requests.error} onRetry={() => requests.refetch()} skeleton={<SkeletonTable rows={4} cols={5} />} />

      {requests.data && requests.data.length === 0 && (
        <Card className="flex flex-col items-start gap-4">
          <p>{t('citizen.empty')}</p>
          <ButtonLink href="/citizen/apply">{t('nav.apply')}</ButtonLink>
        </Card>
      )}

      {requests.data && requests.data.length > 0 && (
        <TableCard label={t('citizen.myTitle')}>
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">{t('citizen.myTitle')}</caption>
            <thead className={STICKY_HEAD}>
              <tr>
                <th scope="col" className="p-3">{t('citizen.code')}</th>
                <th scope="col" className="p-3">{t('citizen.service')}</th>
                <th scope="col" className="p-3">{t('citizen.status')}</th>
                <th scope="col" className="p-3">{t('citizen.submitted')}</th>
                <th scope="col" className="p-3">
                  <span className="sr-only">{t('citizen.open')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {requests.data.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="p-3 font-mono">{r.trackingCode}</td>
                  <td className="p-3">{serviceName.get(r.serviceTypeCode) ?? r.serviceTypeCode}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status={r.status} />
                      {!r.closedAt && <OverdueBadge overdue={r.overdue} />}
                    </div>
                  </td>
                  <td className="p-3">{formatDate(r.submittedAt, lang)}</td>
                  <td className="p-3">
                    <Link href={`/citizen/requests/${r.id}`} className="font-semibold text-primary">
                      {t('citizen.open')}
                      <span className="sr-only"> {r.trackingCode}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </div>
  );
}
