'use client';

import type { RequestStatus } from '@sewa/shared';
import { Badge, type BadgeTone } from '@/components/common';
import { useI18n } from '@/lib/i18n';

/** One colour per status, used everywhere a status is shown. The label is always written out too. */
const TONE: Record<RequestStatus, BadgeTone> = {
  SUBMITTED: 'neutral',
  UNDER_REVIEW: 'info',
  NEEDS_DOCUMENTS: 'warning',
  FIELD_VERIFICATION: 'info',
  APPROVED: 'success',
  ISSUED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  const { t } = useI18n();
  return <Badge tone={TONE[status]}>{t(`status.${status}`)}</Badge>;
}

export function OverdueBadge({ overdue }: { overdue: boolean }) {
  const { t } = useI18n();
  return <Badge tone={overdue ? 'danger' : 'success'}>{overdue ? t('track.overdue') : t('track.onTime')}</Badge>;
}
