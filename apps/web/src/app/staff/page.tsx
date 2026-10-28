'use client';

import { REQUEST_STATUSES, SERVICE_TYPE_CODES, queueQuerySchema } from '@sewa/shared';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import type { QueueFilters } from '@/api/requests.api';
import { Button, PageTitle, QueryState, SelectField } from '@/components/common';
import { OverdueBadge, StatusBadge } from '@/components/requests/StatusBadge';
import { useMe } from '@/hooks/useAuth';
import { useQueue } from '@/hooks/useRequests';
import { useServiceTypes } from '@/hooks/useReference';
import { formatDate, formatNumber } from '@/lib/format';
import { pickName, useI18n } from '@/lib/i18n';

/**
 * Staff queue (PRD F6). WHICH requests appear is decided by the server from the session
 * (officer → own ward, palika admin → own palika, system admin → all); the page only sends filters.
 *
 * Filters live in the URL (?status=UNDER_REVIEW&page=2), not in React state, so the back button,
 * a page refresh and a copied link all keep them. The URL is read with the SAME Zod schema the API
 * uses, so a hand-edited bad value just falls back to "no filter" instead of breaking the page.
 */
function readFilters(params: URLSearchParams): QueueFilters {
  const parsed = queueQuerySchema.safeParse(Object.fromEntries(params));
  return parsed.success ? parsed.data : { page: 1 };
}

function QueuePage() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = readFilters(searchParams);
  const queue = useQueue(filters);
  const services = useServiceTypes();
  const role = useMe().data?.role;
  const serviceName = new Map((services.data ?? []).map((s) => [s.code, pickName(s, lang)]));

  // Changing a filter goes back to page 1; changing the page keeps the filters.
  function setParam(key: 'status' | 'serviceType' | 'overdue' | 'page', value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    router.replace(`${pathname}?${next}`, { scroll: false });
  }

  const page = filters.page ?? 1;
  const totalPages = queue.data ? Math.max(1, Math.ceil(queue.data.total / queue.data.pageSize)) : 1;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <PageTitle title={t('staff.queueTitle')} intro={t(role === 'WARD_OFFICER' ? 'staff.queueIntroWard' : role === 'PALIKA_ADMIN' ? 'staff.queueIntroPalika' : 'staff.queueIntroNational')} />

      <form role="search" aria-label={t('staff.filters')} className="grid gap-4 sm:grid-cols-3" onSubmit={(e) => e.preventDefault()}>
        <SelectField label={t('citizen.status')} value={filters.status ?? ''} onChange={(e) => setParam('status', e.target.value)}>
          <option value="">{t('staff.all')}</option>
          {REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </SelectField>
        <SelectField label={t('citizen.service')} value={filters.serviceType ?? ''} onChange={(e) => setParam('serviceType', e.target.value)}>
          <option value="">{t('staff.all')}</option>
          {SERVICE_TYPE_CODES.map((code) => (
            <option key={code} value={code}>
              {serviceName.get(code) ?? code}
            </option>
          ))}
        </SelectField>
        <SelectField label={t('staff.timing')} value={filters.overdue === undefined ? '' : String(filters.overdue)} onChange={(e) => setParam('overdue', e.target.value)}>
          <option value="">{t('staff.all')}</option>
          <option value="true">{t('track.overdue')}</option>
          <option value="false">{t('track.onTime')}</option>
        </SelectField>
      </form>

      <QueryState isLoading={queue.isLoading} error={queue.error} onRetry={() => queue.refetch()} />

      {queue.data && (
        <>
          {/* aria-live: a screen reader hears the new count after a filter change. */}
          <p aria-live="polite" className="text-sm text-muted">
            {formatNumber(queue.data.total, lang)} {t('staff.results')}
          </p>

          {queue.data.items.length === 0 ? (
            <p className="rounded-xl border border-line p-6">{t('staff.empty')}</p>
          ) : (
            <div className={`overflow-x-auto rounded-xl border border-line ${queue.isPlaceholderData ? 'opacity-60' : ''}`}>
              <table className="w-full min-w-[860px] text-left text-sm">
                <caption className="sr-only">{t('staff.queueTitle')}</caption>
                <thead className="bg-surface">
                  <tr>
                    <th scope="col" className="p-3">{t('citizen.code')}</th>
                    <th scope="col" className="p-3">{t('citizen.service')}</th>
                    <th scope="col" className="p-3">{t('detail.ward')}</th>
                    <th scope="col" className="p-3">{t('citizen.status')}</th>
                    <th scope="col" className="p-3">{t('citizen.submitted')}</th>
                    <th scope="col" className="p-3">{t('staff.officer')}</th>
                    <th scope="col" className="p-3">
                      <span className="sr-only">{t('citizen.open')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {queue.data.items.map((r) => (
                    <tr key={r.id} className="border-t border-line">
                      <td className="p-3 font-mono">{r.trackingCode}</td>
                      <td className="p-3">{serviceName.get(r.serviceTypeCode) ?? r.serviceNameEn}</td>
                      <td className="p-3">{formatNumber(r.wardNumber, lang)}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge status={r.status} />
                          <OverdueBadge overdue={r.overdue} />
                        </div>
                      </td>
                      <td className="p-3">{formatDate(r.submittedAt, lang)}</td>
                      <td className="p-3">{r.assignedOfficerName ?? <span className="text-muted">{t('staff.unassigned')}</span>}</td>
                      <td className="p-3">
                        <Link href={`/staff/requests/${r.id}`} className="font-semibold text-primary">
                          {t('citizen.open')}
                          <span className="sr-only"> {r.trackingCode}</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <nav aria-label={t('staff.pagination')} className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setParam('page', String(page - 1))}>
              ← {t('staff.prev')}
            </Button>
            <span className="text-sm">
              {t('staff.page')} {formatNumber(page, lang)} / {formatNumber(totalPages, lang)}
            </span>
            <Button variant="secondary" disabled={page >= totalPages} onClick={() => setParam('page', String(page + 1))}>
              {t('staff.next')} →
            </Button>
          </nav>
        </>
      )}
    </div>
  );
}

// useSearchParams() needs a Suspense boundary (same as the login page).
export default function StaffQueuePage() {
  return (
    <Suspense>
      <QueuePage />
    </Suspense>
  );
}
