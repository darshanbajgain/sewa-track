'use client';

import type { RequestDetailDto } from '@sewa/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { changeErrorText } from '@/components/requests/changeError';
import { Alert, Button, Card, Modal, QueryState, TextAreaField } from '@/components/common';
import { RequestHistory } from '@/components/requests/RequestHistory';
import { OverdueBadge, StatusBadge } from '@/components/requests/StatusBadge';
import { useChangeStatus, useRequestDetail } from '@/hooks/useRequests';
import { dueDate, formatDateTime } from '@/lib/format';
import { pickName, useI18n } from '@/lib/i18n';
import { usePageTitle } from '@/lib/usePageTitle';

/**
 * A citizen's request (PRD F4/F6). The ACTIONS shown come from `allowedTransitions`, computed on the
 * server by the domain rules for THIS user, so the page never decides by itself what's allowed
 * (and the API re-checks everything anyway).
 *   NEEDS_DOCUMENTS → "Resubmit" (note required) or "Cancel" · SUBMITTED → "Cancel"
 * Every change sends the `version` we loaded (optimistic locking); a 409 shows a clear message and the
 * hook refetches the latest version.
 */
export default function CitizenRequestPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const detail = useRequestDetail(id);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <Link href="/citizen" className="self-start font-semibold text-primary">
        ← {t('detail.back')}
      </Link>
      <QueryState isLoading={detail.isLoading} error={detail.error} onRetry={() => detail.refetch()} />
      {detail.data && <RequestView request={detail.data} />}
    </div>
  );
}

function RequestView({ request }: { request: RequestDetailDto }) {
  const { t, lang } = useI18n();
  usePageTitle(`${request.trackingCode} · ${pickName(request.service, lang)}`);
  const change = useChangeStatus(request.id);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string>();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [saved, setSaved] = useState(false);

  const canResubmit = request.status === 'NEEDS_DOCUMENTS' && request.allowedTransitions.includes('UNDER_REVIEW');
  const canCancel = request.allowedTransitions.includes('CANCELLED');
  const lastNote = [...request.events].reverse().find((e) => e.toStatus === 'NEEDS_DOCUMENTS')?.note;

  function run(body: { toStatus: 'UNDER_REVIEW' | 'CANCELLED'; note?: string }) {
    setSaved(false);
    change.mutate({ ...body, version: request.version }, { onSuccess: () => setSaved(true) });
  }

  function resubmit() {
    if (!note.trim()) {
      setNoteError(t('detail.noteRequired'));
      return;
    }
    setNoteError(undefined);
    run({ toStatus: 'UNDER_REVIEW', note: note.trim() });
  }

  const changeError = changeErrorText(change.error, t);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-sm text-muted">{request.trackingCode}</p>
          <h1 className="text-3xl font-bold text-primary">{pickName(request.service, lang)}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={request.status} />
          {!request.closedAt && <OverdueBadge overdue={request.overdue} />}
        </div>
      </div>

      {saved && <Alert tone="success">{t('detail.changed')}</Alert>}
      {changeError && <Alert tone="error">{changeError}</Alert>}

      {canResubmit && (
        <Card as="section" aria-labelledby="docs-title" className="flex flex-col gap-3 border-warn bg-warn-soft">
          <h2 id="docs-title" className="text-lg font-bold text-warn">
            {t('detail.needsDocsTitle')}
          </h2>
          {lastNote && <p className="rounded-md bg-white p-3">“{lastNote}”</p>}
          <TextAreaField label={t('detail.resubmitNote')} rows={2} value={note} onChange={(e) => setNote(e.target.value)} error={noteError} maxLength={1000} />
          <div className="flex flex-wrap gap-3">
            <Button onClick={resubmit} loading={change.isPending}>
              {t('detail.resubmit')}
            </Button>
          </div>
        </Card>
      )}

      {canCancel && (
        <div>
          <Button variant="danger" onClick={() => setConfirmCancel(true)}>
            {t('detail.cancel')}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-6">
        <Card as="section" aria-labelledby="details-title" className="flex flex-[1_1_300px] flex-col gap-2 text-sm">
          <h2 id="details-title" className="mb-1 text-lg font-bold">
            {t('detail.details')}
          </h2>
          <p>
            <span className="text-muted">{t('detail.ward')}:</span> {pickName({ nameEn: request.location.palikaNameEn, nameNe: request.location.palikaNameNe }, lang)},{' '}
            {t('apply.wardN')} {request.location.wardNumber}
          </p>
          <p>
            <span className="text-muted">{t('detail.fee')}:</span>{' '}
            {request.service.feeNpr === 0 ? t('services.free') : `NPR ${request.service.feeNpr} · ${request.feePaidAt ? t('detail.feePaid') : t('detail.feeNotPaid')}`}
          </p>
          <p>
            <span className="text-muted">{t('detail.due')}:</span> {formatDateTime(dueDate(request.submittedAt, request.service.serviceDays), lang)}
          </p>
          <p>
            <span className="text-muted">{t('detail.purpose')}:</span> {request.purpose}
          </p>
        </Card>

        <RequestHistory events={request.events} />
      </div>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title={t('detail.cancelTitle')}
        description={t('detail.cancelBody')}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
              {t('detail.keep')}
            </Button>
            <Button
              variant="danger"
              loading={change.isPending}
              onClick={() => {
                setConfirmCancel(false);
                run({ toStatus: 'CANCELLED' });
              }}
            >
              {t('detail.cancelConfirm')}
            </Button>
          </>
        }
      >
        <p className="font-mono text-sm">{request.trackingCode}</p>
      </Modal>
    </>
  );
}
