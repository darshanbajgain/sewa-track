'use client';

import type { RequestDetailDto, RequestStatus } from '@sewa/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, Modal, QueryState, TextAreaField, type ButtonVariant } from '@/components/common';
import { changeErrorText } from '@/components/requests/changeError';
import { RequestHistory } from '@/components/requests/RequestHistory';
import { OverdueBadge, StatusBadge } from '@/components/requests/StatusBadge';
import { useChangeStatus, useMarkFeePaid, useRequestDetail } from '@/hooks/useRequests';
import { formatDateTime } from '@/lib/format';
import { pickName, useI18n } from '@/lib/i18n';
import { nextStep, type NextStep, type StaffAction } from '@/lib/requestFlow';
import { usePageTitle } from '@/lib/usePageTitle';
import { RequestChecklist } from './RequestChecklist';
import { RequestProgress } from './RequestProgress';

/**
 * Staff request detail (PRD F6), used by the ward, palika and admin portals (`backHref` = that portal's queue).
 * Layout: progress bar → "Next step" card + checklist → details + history.
 *
 * The buttons come ONLY from the server's `allowedTransitions` and `canMarkFeePaid` (computed by
 * domain/transitions.ts for this user), so the page never offers a move the rules don't allow.
 * lib/requestFlow.ts only arranges them: one primary "next step", the other moves, Reject apart.
 * Palika and system admins get an empty list: they see the progress and checklist, read only.
 *
 * Every action opens a confirm dialog. Where the rules need text (asking for documents, finishing a
 * field visit, rejecting), the dialog requires it; the API checks again and returns 400 if it's missing.
 * Every change sends the `version` we loaded; a 409 shows "someone else saved first" and we refetch.
 */
export function RequestDetailView({ backHref }: { backHref: string }) {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const detail = useRequestDetail(id);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <Link href={backHref} className="self-start font-semibold text-primary">
        ← {t('staff.backToQueue')}
      </Link>
      <QueryState isLoading={detail.isLoading} error={detail.error} onRetry={() => detail.refetch()} />
      {detail.data && <RequestView request={detail.data} />}
    </div>
  );
}

/** How each move looks in the UI. `input` mirrors the NOTE/REASON conditions in domain/transitions.ts. */
interface ActionUi {
  key: Parameters<ReturnType<typeof useI18n>['t']>[0];
  input: 'note' | 'reason' | null;
  variant: ButtonVariant;
}

function actionUi(from: RequestStatus, to: RequestStatus): ActionUi {
  switch (to) {
    case 'UNDER_REVIEW':
      return from === 'FIELD_VERIFICATION'
        ? { key: 'staff.do.fieldDone', input: 'note', variant: 'primary' }
        : { key: 'staff.do.startReview', input: null, variant: 'primary' };
    case 'NEEDS_DOCUMENTS':
      return { key: 'staff.do.askDocs', input: 'note', variant: 'secondary' };
    case 'FIELD_VERIFICATION':
      return { key: 'staff.do.fieldVisit', input: null, variant: 'secondary' };
    case 'APPROVED':
      return { key: 'staff.do.approve', input: null, variant: 'primary' };
    case 'REJECTED':
      return { key: 'staff.do.reject', input: 'reason', variant: 'danger' };
    case 'ISSUED':
      return { key: 'staff.do.issue', input: null, variant: 'primary' };
    default:
      return { key: `status.${to}`, input: null, variant: 'secondary' };
  }
}

type Pending = StaffAction | null;

function RequestView({ request }: { request: RequestDetailDto }) {
  const { t, lang } = useI18n();
  usePageTitle(`${request.trackingCode} · ${pickName(request.service, lang)}`);
  const change = useChangeStatus(request.id);
  const fee = useMarkFeePaid(request.id);
  const [pending, setPending] = useState<Pending>(null);
  const [text, setText] = useState('');
  const [textError, setTextError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const ui = pending?.kind === 'status' ? actionUi(request.status, pending.to) : null;
  const busy = change.isPending || fee.isPending;
  const error = changeErrorText(change.error ?? fee.error, t);
  const step = nextStep(request);

  function open(next: Pending) {
    change.reset();
    fee.reset();
    setSaved(false);
    setText('');
    setTextError(undefined);
    setPending(next);
  }

  function confirm() {
    if (!pending) return;
    const done = { onSuccess: () => setSaved(true), onSettled: () => setPending(null) };
    if (pending.kind === 'fee') {
      fee.mutate(request.version, done);
      return;
    }
    const value = text.trim();
    if (ui?.input && !value) {
      setTextError(t(ui.input === 'reason' ? 'staff.reasonRequired' : 'staff.noteRequired'));
      return;
    }
    // A rejection's text goes in `reason`; for every other move it's an (optional or required) note.
    const extra = !value ? {} : ui?.input === 'reason' ? { reason: value } : { note: value };
    change.mutate({ toStatus: pending.to, version: request.version, ...extra }, done);
  }

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
      {error && <Alert tone="error">{error}</Alert>}

      <RequestProgress request={request} />

      <div className="flex flex-wrap gap-6">
        <NextStepCard request={request} step={step} onPick={open} />
        <RequestChecklist request={request} />
      </div>

      <div className="flex flex-wrap gap-6">
        <Card as="section" aria-labelledby="details-title" className="flex flex-[1_1_300px] flex-col gap-2 text-sm">
          <h2 id="details-title" className="mb-1 text-lg font-bold">
            {t('detail.details')}
          </h2>
          <p>
            <span className="text-muted">{t('apply.name')}:</span> {request.applicant.name}
          </p>
          <p>
            <span className="text-muted">{t('apply.nid')}:</span> <span className="font-mono">{request.applicant.nid}</span>
          </p>
          <p>
            <span className="text-muted">{t('detail.ward')}:</span> {pickName({ nameEn: request.location.palikaNameEn, nameNe: request.location.palikaNameNe }, lang)},{' '}
            {t('apply.wardN')} {request.location.wardNumber}
          </p>
          <p>
            <span className="text-muted">{t('staff.officer')}:</span> {request.assignedOfficer?.name ?? t('staff.unassigned')}
          </p>
          <p>
            <span className="text-muted">{t('citizen.submitted')}:</span> {formatDateTime(request.submittedAt, lang)}
          </p>
          <p>
            <span className="text-muted">{t('detail.purpose')}:</span> {request.purpose}
          </p>
        </Card>

        <RequestHistory events={request.events} />
      </div>

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending?.kind === 'fee' ? t('staff.do.feePaid') : ui ? t(ui.key) : ''}
        description={pending?.kind === 'fee' ? t('staff.feeConfirm') : t('staff.confirmBody')}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              {t('staff.back')}
            </Button>
            <Button variant={ui?.variant === 'danger' ? 'danger' : 'primary'} loading={busy} onClick={confirm}>
              {t('staff.confirm')}
            </Button>
          </>
        }
      >
        <p className="font-mono text-sm">{request.trackingCode}</p>
        {pending?.kind === 'status' && (
          <div className="mt-3">
            <TextAreaField
              label={t(ui?.input === 'reason' ? 'staff.reason' : ui?.input === 'note' ? 'staff.noteNeeded' : 'staff.noteOptional')}
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              error={textError}
              maxLength={1000}
              required={ui?.input !== null}
            />
          </div>
        )}
      </Modal>
    </>
  );
}

/** The one obvious next action, with a sentence saying why; other moves below it; Reject set apart. */
function NextStepCard({ request, step, onPick }: { request: RequestDetailDto; step: NextStep | null; onPick: (action: StaffAction) => void }) {
  const { t } = useI18n();
  const label = (a: StaffAction) =>
    a.kind === 'fee' ? `${t('staff.do.feePaid')} (NPR ${request.service.feeNpr})` : t(actionUi(request.status, a.to).key);

  return (
    <Card as="section" aria-labelledby="next-title" className="flex flex-[2_1_420px] flex-col gap-4 border-2 border-primary/30">
      <h2 id="next-title" className="text-lg font-bold">
        {t('staff.nextStep')}
      </h2>

      {!step ? (
        // Closed, or a read-only role: say what happens next and who does it.
        <div className="flex flex-col gap-1">
          {!request.closedAt && <p>{t(`staff.wait.${request.status as Exclude<RequestStatus, 'ISSUED' | 'REJECTED' | 'CANCELLED'>}`)}</p>}
          <p className="text-sm text-muted">{request.closedAt ? t('staff.closed') : t('staff.readOnly')}</p>
        </div>
      ) : (
        <>
          <p>{t(`staff.hint.${step.hint}`)}</p>
          <div className="flex flex-wrap items-center gap-3">
            {step.primary && (
              <Button size="lg" onClick={() => onPick(step.primary!)}>
                {label(step.primary)}
              </Button>
            )}
            {/* Approve isn't allowed yet: show it greyed out with the reason, so the officer knows what's missing. */}
            {step.approveBlockedBy && (
              <span className="flex flex-col gap-1">
                <Button size="lg" variant="secondary" disabled aria-describedby="approve-blocked">
                  {t('staff.do.approve')}
                </Button>
                <span id="approve-blocked" className="text-sm text-warn">
                  {t(step.approveBlockedBy === 'fee' ? 'staff.approveNeedsFee' : 'staff.approveNeedsField')}
                </span>
              </span>
            )}
          </div>

          {step.others.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-muted">{t('staff.otherActions')}</p>
              <div className="flex flex-wrap gap-3">
                {step.others.map((a) => (
                  <Button key={a.kind === 'fee' ? 'fee' : a.to} variant="secondary" onClick={() => onPick(a)}>
                    {label(a)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {step.reject && (
            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <Button variant="danger" onClick={() => onPick(step.reject!)}>
                {t('staff.do.reject')}
              </Button>
              <span className="text-sm text-muted">{t('staff.rejectHint')}</span>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
