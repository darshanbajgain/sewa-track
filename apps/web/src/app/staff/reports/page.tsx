'use client';

import { RequireRole } from '@/components/auth/RequireRole';
import { Card, PageTitle, QueryState } from '@/components/common';
import { StatusBadge } from '@/components/requests/StatusBadge';
import { useServiceTypes } from '@/hooks/useReference';
import { useSummary } from '@/hooks/useStats';
import { formatNumber } from '@/lib/format';
import { pickName, useI18n } from '@/lib/i18n';
import { PORTAL_ROLES } from '@/lib/routing';

/**
 * Staff reports (PRD F7) from GET /stats/summary: palika admin → own palika (rows per ward),
 * system admin → Nepal (rows per province). Aggregates only, no personal data.
 * Ward officers can't call this endpoint (403), so the page is guarded for the two roles too.
 */
export default function ReportsPage() {
  return (
    <RequireRole roles={PORTAL_ROLES.reports}>
      <Reports />
    </RequireRole>
  );
}

function Reports() {
  const { t, lang } = useI18n();
  const summary = useSummary();
  const services = useServiceTypes();
  const serviceName = new Map((services.data ?? []).map((s) => [s.code, pickName(s, lang)]));
  const fmt = (n: number) => formatNumber(n, lang);
  const data = summary.data;
  const national = data?.scope.kind === 'national';

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <PageTitle title={t('staff.reportsTitle')} intro={t(national ? 'staff.reportsIntroNational' : 'staff.reportsIntroPalika')} />
      <QueryState isLoading={summary.isLoading} error={summary.error} onRetry={() => summary.refetch()} />

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <p className="text-sm text-muted">{t('home.open')}</p>
              <p className="text-3xl font-bold text-primary">{fmt(data.totals.pending)}</p>
            </Card>
            <Card className="border-accent/40">
              <p className="text-sm text-muted">{t('home.overdue')}</p>
              <p className="text-3xl font-bold text-accent">{fmt(data.totals.overdue)}</p>
            </Card>
            <Card>
              <p className="text-sm text-muted">{t('home.onTime')}</p>
              <p className="text-3xl font-bold text-ok">{data.totals.onTimeRate === null ? '—' : `${fmt(Math.round(data.totals.onTimeRate * 100))}%`}</p>
            </Card>
            <Card>
              <p className="text-sm text-muted">{t('staff.avgDays')}</p>
              <p className="text-3xl font-bold text-primary">{data.totals.avgDaysToClose === null ? '—' : formatNumber(Number(data.totals.avgDaysToClose.toFixed(1)), lang)}</p>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card as="section" aria-labelledby="by-status" className="flex flex-col gap-3">
              <h2 id="by-status" className="text-lg font-bold">
                {t('staff.byStatus')}
              </h2>
              <table className="w-full text-left text-sm">
                <tbody>
                  {data.byStatus.map((row) => (
                    <tr key={row.status} className="border-t border-line first:border-t-0">
                      <th scope="row" className="py-2 font-normal">
                        <StatusBadge status={row.status} />
                      </th>
                      <td className="py-2 text-right font-semibold">{fmt(row.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card as="section" aria-labelledby="by-service" className="flex flex-col gap-3">
              <h2 id="by-service" className="text-lg font-bold">
                {t('staff.byService')}
              </h2>
              <table className="w-full text-left text-sm">
                <tbody>
                  {data.byServiceType.map((row) => (
                    <tr key={row.code} className="border-t border-line first:border-t-0">
                      <th scope="row" className="py-2 font-normal">
                        {serviceName.get(row.code) ?? row.code}
                      </th>
                      <td className="py-2 text-right font-semibold">{fmt(row.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          <section aria-labelledby="by-area" className="flex flex-col gap-3">
            <h2 id="by-area" className="text-lg font-bold">
              {t(national ? 'staff.byProvince' : 'staff.byWard')}
            </h2>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="bg-surface">
                  <tr>
                    <th scope="col" className="p-3">{t(national ? 'staff.province' : 'detail.ward')}</th>
                    <th scope="col" className="p-3">{t('home.open')}</th>
                    <th scope="col" className="p-3">{t('home.overdue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Most overdue first: that's where a supervisor should look. */}
                  {[...data.byArea]
                    .sort((a, b) => b.overdue - a.overdue)
                    .map((row) => (
                      <tr key={row.areaId} className="border-t border-line">
                        <th scope="row" className="p-3 font-medium">{row.label}</th>
                        <td className="p-3">{fmt(row.pending)}</td>
                        <td className="p-3 font-semibold text-accent">{fmt(row.overdue)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
          <p className="text-sm text-muted">{t('home.demoData')}</p>
        </>
      )}
    </div>
  );
}
