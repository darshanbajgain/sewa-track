'use client';

import type { DocumentDto, DocumentStatus, RequestDetailDto } from '@sewa/shared';
import { useState } from 'react';
import { documentFileUrl } from '@/api/requests.api';
import { Alert, Badge, Button, Card, Modal, SelectField, TextAreaField, type BadgeTone } from '@/components/common';
import { changeErrorText } from '@/components/requests/changeError';
import { useAddDocument, useReviewDocument, useUploadDocumentFile } from '@/hooks/useRequests';
import { useServiceTypes } from '@/hooks/useReference';
import { formatDate } from '@/lib/format';
import { pickName, useI18n } from '@/lib/i18n';
import { FilePicker, fileProblem, formatSize } from './FilePicker';

const TONE: Record<DocumentStatus, BadgeTone> = { REQUESTED: 'warning', UPLOADED: 'info', ACCEPTED: 'success', REJECTED: 'danger' };

/**
 * Documents of one request (PRD F15), on the citizen's and the staff's detail page.
 *   mode "citizen": upload into each requested / "not OK" document, add one from the service's list
 *   mode "staff":   view each file; the ward officer accepts it or marks it "not OK" with a reason
 * What is allowed comes from the server (`canUploadDocuments`, `canReviewDocuments`); the API re-checks.
 */
export function DocumentsCard({ request, mode }: { request: RequestDetailDto; mode: 'citizen' | 'staff' }) {
  const { t, lang } = useI18n();
  const upload = useUploadDocumentFile(request.id);
  const add = useAddDocument();
  const review = useReviewDocument(request.id);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notOk, setNotOk] = useState<DocumentDto | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string>();
  const [newName, setNewName] = useState('');

  // The service's list, to show document names in the chosen language and to offer "add a document".
  const listed = useServiceTypes().data?.find((s) => s.code === request.service.code)?.requiredDocuments ?? [];
  const nameOf = (doc: DocumentDto) => {
    const match = listed.find((d) => d.nameEn === doc.name);
    return match ? pickName(match, lang) : doc.name;
  };
  const notYetAdded = listed.filter((d) => !request.documents.some((doc) => doc.name === d.nameEn));
  const canUpload = mode === 'citizen' && request.canUploadDocuments;
  const canReview = mode === 'staff' && request.canReviewDocuments;

  function done(text: string) {
    setMessage({ tone: 'success', text });
    setBusyId(null);
  }
  function failed(err: unknown) {
    setMessage({ tone: 'error', text: changeErrorText(err, t) ?? t('common.error') });
    setBusyId(null);
  }
  /** Check in the browser first; returns false (and shows why) if the file can't be sent. */
  function precheck(file: File): boolean {
    const problem = fileProblem(file);
    if (problem) setMessage({ tone: 'error', text: t(problem) });
    else setMessage(null);
    return !problem;
  }

  function uploadInto(doc: DocumentDto, file: File) {
    if (!precheck(file)) return;
    setBusyId(doc.id);
    upload.mutate({ documentId: doc.id, file }, { onSuccess: () => done(t('docs.uploaded')), onError: failed });
  }
  function addListed(file: File) {
    if (!newName || !precheck(file)) return;
    setBusyId('new');
    add.mutate(
      { id: request.id, name: newName, file },
      {
        onSuccess: () => {
          setNewName('');
          done(t('docs.uploaded'));
        },
        onError: failed,
      },
    );
  }
  function accept(doc: DocumentDto) {
    setBusyId(doc.id);
    review.mutate({ documentId: doc.id, body: { decision: 'ACCEPTED' } }, { onSuccess: () => done(t('docs.reviewed')), onError: failed });
  }
  function confirmNotOk() {
    if (!notOk) return;
    if (!reason.trim()) {
      setReasonError(t('docs.reasonRequired'));
      return;
    }
    const doc = notOk;
    setNotOk(null);
    setBusyId(doc.id);
    review.mutate(
      { documentId: doc.id, body: { decision: 'REJECTED', note: reason.trim() } },
      { onSuccess: () => done(t('docs.reviewed')), onError: failed },
    );
  }

  const waiting = request.documents.filter((d) => d.status === 'REQUESTED' || d.status === 'REJECTED').length;
  const highlight = mode === 'citizen' && waiting > 0;

  return (
    <Card as="section" aria-labelledby="documents-title" className={`flex flex-col gap-4 ${highlight ? 'border-2 border-warn' : ''}`}>
      <div className="flex flex-col gap-1">
        <h2 id="documents-title" className="text-lg font-bold">
          {t('docs.title')}
        </h2>
        <p className="text-sm text-muted">{mode === 'citizen' ? t('docs.introCitizen') : t('docs.introStaff')}</p>
      </div>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      {request.documents.length === 0 ? (
        <p className="text-sm text-muted">{t('docs.none')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {request.documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{nameOf(doc)}</span>
                  <Badge tone={TONE[doc.status]}>{t(`docs.status.${mode === 'staff' ? 'staff.' : ''}${doc.status}`)}</Badge>
                </div>
                {doc.file && (
                  <p className="text-sm text-muted">
                    <a href={documentFileUrl(request.id, doc.id)} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">
                      {t('docs.view')}
                      <span className="sr-only">: {nameOf(doc)}</span>
                    </a>{' '}
                    · {doc.file.name} · {formatSize(doc.file.sizeBytes)} · {formatDate(doc.file.uploadedAt, lang)}
                  </p>
                )}
                {doc.status === 'REJECTED' && doc.reviewNote && (
                  <p className="text-sm text-accent">
                    {t('docs.notOkReason')}: “{doc.reviewNote}”
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {canUpload && doc.status !== 'ACCEPTED' && (
                  <FilePicker
                    label={doc.file ? t('docs.replace') : t('docs.upload')}
                    variant={doc.status === 'REQUESTED' || doc.status === 'REJECTED' ? 'primary' : 'secondary'}
                    loading={busyId === doc.id}
                    disabled={busyId !== null}
                    onPick={(file) => uploadInto(doc, file)}
                  />
                )}
                {canReview && doc.file && doc.status !== 'ACCEPTED' && (
                  <Button loading={busyId === doc.id} disabled={busyId !== null} onClick={() => accept(doc)}>
                    {t('docs.accept')}
                  </Button>
                )}
                {canReview && doc.file && doc.status !== 'REJECTED' && (
                  <Button
                    variant="danger"
                    disabled={busyId !== null}
                    onClick={() => {
                      setReason('');
                      setReasonError(undefined);
                      setNotOk(doc);
                    }}
                  >
                    {t('docs.notOk')}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canUpload && notYetAdded.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg bg-surface p-4">
          <p className="font-semibold">{t('docs.addTitle')}</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-[1_1_260px]">
              <SelectField
                label={t('docs.which')}
                value={newName}
                onChange={setNewName}
                placeholder={t('apply.choose')}
                options={notYetAdded.map((d) => ({ value: d.nameEn, label: pickName(d, lang) }))}
              />
            </div>
            <FilePicker label={t('docs.chooseFile')} disabled={!newName || busyId !== null} loading={busyId === 'new'} onPick={addListed} />
          </div>
        </div>
      )}

      {canUpload && <p className="text-xs text-muted">{t('docs.rules')}</p>}

      <Modal
        open={notOk !== null}
        onClose={() => setNotOk(null)}
        title={t('docs.notOkTitle')}
        description={notOk ? nameOf(notOk) : undefined}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setNotOk(null)}>
              {t('staff.back')}
            </Button>
            <Button variant="danger" onClick={confirmNotOk}>
              {t('docs.notOk')}
            </Button>
          </>
        }
      >
        <TextAreaField label={t('docs.notOkLabel')} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} error={reasonError} maxLength={1000} required />
      </Modal>
    </Card>
  );
}
