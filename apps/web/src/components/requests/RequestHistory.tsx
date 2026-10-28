'use client';

import type { RequestDetailDto } from '@sewa/shared';
import { Card } from '@/components/common';
import { formatDateTime } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

/** The audit timeline of one request (from request_events), used by the citizen and staff detail pages. */
export function RequestHistory({ events }: { events: RequestDetailDto['events'] }) {
  const { t, lang } = useI18n();
  return (
    <Card as="section" aria-labelledby="history-title" className="flex flex-[2_1_420px] flex-col gap-3">
      <h2 id="history-title" className="text-lg font-bold">
        {t('detail.history')}
      </h2>
      <ol className="flex flex-col gap-3 text-sm">
        {events.map((e, i) => (
          <li key={i} className="border-l-2 border-primary pl-3">
            <p className="font-semibold">
              {e.toStatus ? t(`status.${e.toStatus}`) : t(`action.${e.action}`)}
              <span className="font-normal text-muted"> · {e.actorName ?? t('detail.system')}</span>
            </p>
            <p className="text-muted">{formatDateTime(e.at, lang)}</p>
            {e.note && <p className="mt-1">“{e.note}”</p>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
