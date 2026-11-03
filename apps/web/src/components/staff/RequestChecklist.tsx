'use client';

import type { RequestDetailDto } from '@sewa/shared';
import { Card } from '@/components/common';
import { dueDate, formatDate } from '@/lib/format';
import { useI18n, type MessageKey } from '@/lib/i18n';

type ItemState = 'ok' | 'todo' | 'na' | 'bad';
const MARK: Record<ItemState, { icon: string; className: string }> = {
  ok: { icon: '✓', className: 'bg-ok-soft text-ok' },
  todo: { icon: '○', className: 'bg-warn-soft text-warn' },
  na: { icon: '–', className: 'bg-surface text-muted' },
  bad: { icon: '!', className: 'bg-accent-soft text-accent' },
};

/**
 * The checks an officer looks at before approving: ID, fee, field visit, promised time.
 * Read only: the same for every role. Each line has an icon AND words, so it doesn't rely on colour.
 */
export function RequestChecklist({ request }: { request: RequestDetailDto }) {
  const { t, lang } = useI18n();
  const id = request.identityCheck?.status;
  const due = formatDate(dueDate(request.submittedAt, request.service.serviceDays), lang);

  const items: { label: MessageKey; state: ItemState; value: string }[] = [
    {
      label: 'staff.check.identity',
      state: id === 'MATCH' ? 'ok' : id === 'NO_MATCH' ? 'bad' : 'todo',
      value: t(id ? `staff.id.${id}` : 'staff.id.none'),
    },
    {
      label: 'detail.fee',
      state: request.service.feeNpr === 0 ? 'na' : request.feePaidAt ? 'ok' : 'todo',
      value:
        request.service.feeNpr === 0
          ? t('services.free')
          : `NPR ${request.service.feeNpr} · ${request.feePaidAt ? t('detail.feePaid') : t('detail.feeNotPaid')}`,
    },
    {
      label: 'services.fieldVisit',
      state: !request.service.requiresFieldVerification ? 'na' : request.fieldVerifiedAt ? 'ok' : 'todo',
      value: !request.service.requiresFieldVerification
        ? t('staff.check.notNeeded')
        : request.fieldVerifiedAt
          ? `${t('staff.check.done')} · ${formatDate(request.fieldVerifiedAt, lang)}`
          : t('staff.notYet'),
    },
    {
      label: 'staff.check.time',
      state: request.closedAt ? 'na' : request.overdue ? 'bad' : 'ok',
      value: `${request.overdue ? t('track.overdue') : t('track.onTime')} · ${t('detail.due')} ${due}`,
    },
  ];

  return (
    <Card as="section" aria-labelledby="checklist-title" className="flex flex-[1_1_280px] flex-col gap-3">
      <h2 id="checklist-title" className="text-lg font-bold">
        {t('staff.check.title')}
      </h2>
      <ul className="flex flex-col gap-3 text-sm">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-3">
            <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${MARK[item.state].className}`}>
              {MARK[item.state].icon}
            </span>
            <span className="flex flex-col">
              <span className="font-semibold">{t(item.label)}</span>
              <span className="text-muted">{item.value}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
