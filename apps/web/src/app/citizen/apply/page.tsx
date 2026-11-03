'use client';

import { createRequestSchema, type ServiceTypeCode } from '@sewa/shared';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/api/client';
import type { CreatedRequest } from '@/api/requests.api';
import { Alert, Badge, Button, ButtonLink, Card, CheckboxField, PageTitle, SelectField, TextAreaField, TextField } from '@/components/common';
import { FilePicker, fileProblem, formatSize } from '@/components/documents/FilePicker';
import { useDistricts, useLocalLevels, useProvinces, useServiceTypes, useWards } from '@/hooks/useReference';
import { useAddDocument, useSubmitRequest } from '@/hooks/useRequests';
import { pickName, useI18n } from '@/lib/i18n';

/**
 * Apply (PRD F4). Cascading location dropdowns: each list loads only after its parent is chosen
 * (the hooks use `enabled`), and choosing a new parent clears the children.
 *
 * Validation runs twice on purpose:
 *   1. here, with the SAME Zod schema the API uses (instant feedback, no round trip)
 *   2. on the server (the real check; the browser can always be bypassed)
 *
 * Documents (PRD F15) are optional here: the citizen may attach files for the service's listed
 * documents. A file can only be stored on an existing request, so they are uploaded one by one right
 * AFTER the request is created, and the success screen shows how each one went.
 */
type UploadState = 'uploading' | 'done' | 'failed';
type FieldErrors = Partial<Record<'serviceTypeCode' | 'wardId' | 'purpose' | 'name' | 'nid' | 'consent', string>>;

/** Zod issue path → our field name: ["applicant", "nid"] → "nid". */
function fieldOf(path: string): keyof FieldErrors | null {
  const last = path.split('.').pop();
  return last === 'serviceTypeCode' || last === 'wardId' || last === 'purpose' || last === 'name' || last === 'nid' || last === 'consent'
    ? last
    : null;
}

export default function ApplyPage() {
  const { t, lang } = useI18n();
  const submit = useSubmitRequest();

  const [service, setService] = useState<ServiceTypeCode | ''>('');
  const [provinceId, setProvinceId] = useState<number>();
  const [districtId, setDistrictId] = useState<number>();
  const [localLevelId, setLocalLevelId] = useState<number>();
  const [wardId, setWardId] = useState<number>();
  const [purpose, setPurpose] = useState('');
  const [name, setName] = useState('');
  const [nid, setNid] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [created, setCreated] = useState<CreatedRequest | null>(null);
  const [copied, setCopied] = useState(false);
  const [files, setFiles] = useState<Record<string, File>>({}); // listed document name (English) → chosen file
  const [fileError, setFileError] = useState<string>();
  const [uploads, setUploads] = useState<Record<string, { state: UploadState; reason?: string }>>({});
  const addDocument = useAddDocument();

  const services = useServiceTypes();
  const provinces = useProvinces();
  const districts = useDistricts(provinceId);
  const localLevels = useLocalLevels(districtId);
  const wards = useWards(localLevelId);
  const selectedService = services.data?.find((s) => s.code === service);

  const toNumber = (value: string) => (value ? Number(value) : undefined);
  const docLabel = (nameEn: string) => {
    const d = selectedService?.requiredDocuments.find((x) => x.nameEn === nameEn);
    return d ? pickName(d, lang) : nameEn;
  };

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const input = { serviceTypeCode: service, wardId, purpose, applicant: { name, nid }, consent };
    const parsed = createRequestSchema.safeParse(input);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = fieldOf(issue.path.join('.'));
        if (field && !next[field]) next[field] = t(`apply.err.${field}`);
      }
      setErrors(next);
      return;
    }
    setErrors({});
    submit.mutate(parsed.data, {
      onSuccess: (request) => {
        setCreated(request);
        void uploadFiles(request.id);
      },
      onError: (err) => {
        // Server-side validation (same rules): show it on the fields too.
        if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
          const issues = (err.details?.issues as { path: string }[] | undefined) ?? [];
          const next: FieldErrors = {};
          for (const issue of issues) {
            const field = fieldOf(issue.path);
            if (field) next[field] = t(`apply.err.${field}`);
          }
          setErrors(next);
        }
      },
    });
  }

  /** One at a time, so a slow connection isn't asked to send several files at once. */
  async function uploadFiles(requestId: string) {
    for (const [docName, file] of Object.entries(files)) {
      setUploads((u) => ({ ...u, [docName]: { state: 'uploading' } }));
      try {
        await addDocument.mutateAsync({ id: requestId, name: docName, file });
        setUploads((u) => ({ ...u, [docName]: { state: 'done' } }));
      } catch (err) {
        // e.g. "Only JPEG, PNG or PDF files are accepted": the browser only sees the name, the server the bytes.
        const reason = err instanceof ApiError ? err.message : undefined;
        setUploads((u) => ({ ...u, [docName]: { state: 'failed', reason } }));
      }
    }
  }

  function attach(docName: string, file: File) {
    const problem = fileProblem(file);
    setFileError(problem ? t(problem) : undefined);
    if (!problem) setFiles((f) => ({ ...f, [docName]: file }));
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      /* clipboard blocked: the code is still visible to copy by hand */
    }
  }

  if (created) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
        <Card as="section" aria-labelledby="success-title" className="flex flex-col gap-4 border-ok">
          <h1 id="success-title" className="text-2xl font-bold text-ok">
            {t('apply.successTitle')}
          </h1>
          <p>{t('apply.successBody')}</p>
          <p className="rounded-lg bg-surface p-4 text-center font-mono text-2xl font-bold tracking-widest text-primary">{created.trackingCode}</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => copyCode(created.trackingCode)}>
              {copied ? t('apply.copied') : t('apply.copy')}
            </Button>
            <ButtonLink href={`/citizen/requests/${created.id}`}>{t('apply.viewRequest')}</ButtonLink>
            <Button variant="ghost" onClick={() => window.location.reload()}>
              {t('apply.another')}
            </Button>
          </div>
          {Object.keys(uploads).length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-line p-4">
              <p className="font-semibold">{t('docs.title')}</p>
              <ul aria-live="polite" className="flex flex-col gap-1 text-sm">
                {Object.entries(uploads).map(([docName, { state, reason }]) => (
                  <li key={docName} className={state === 'failed' ? 'text-accent' : state === 'done' ? 'text-ok' : 'text-muted'}>
                    {state === 'done' ? '✓' : state === 'failed' ? '!' : '…'} {docLabel(docName)}: {t(`apply.upload.${state}`)}
                    {reason && ` (${reason})`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p role="status" className="sr-only">
            {copied ? t('apply.copied') : ''}
          </p>
        </Card>
      </div>
    );
  }

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <PageTitle title={t('apply.title')} intro={t('apply.intro')} />
      {hasErrors && <Alert tone="error">{t('apply.fixErrors')}</Alert>}
      {submit.error && !(submit.error instanceof ApiError && submit.error.code === 'VALIDATION_ERROR') && (
        <Alert tone="error">{t('common.error')}</Alert>
      )}

      <div className="flex flex-wrap items-start gap-6">
        <form onSubmit={onSubmit} noValidate className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
          <fieldset className="flex flex-col gap-3 rounded-xl border border-line p-5">
            <legend className="px-1 font-bold">{t('apply.step1')}</legend>
            <SelectField
              label={t('apply.service')}
              value={service}
              onChange={(v) => {
                setService(v as ServiceTypeCode | '');
                setFiles({}); // another service has another list of documents
              }}
              placeholder={t('apply.choose')}
              options={(services.data ?? []).map((s) => ({ value: s.code, label: pickName(s, lang) }))}
              error={errors.serviceTypeCode}
              required
            />
          </fieldset>

          <fieldset className="grid gap-3 rounded-xl border border-line p-5 sm:grid-cols-2">
            <legend className="px-1 font-bold">{t('apply.step2')}</legend>
            <SelectField
              label={t('apply.province')}
              value={String(provinceId ?? '')}
              onChange={(v) => {
                setProvinceId(toNumber(v));
                setDistrictId(undefined);
                setLocalLevelId(undefined);
                setWardId(undefined);
              }}
              placeholder={t('apply.choose')}
              options={(provinces.data ?? []).map((p) => ({ value: String(p.id), label: pickName(p, lang) }))}
              required
            />
            <SelectField
              label={t('apply.district')}
              value={String(districtId ?? '')}
              disabled={provinceId === undefined}
              onChange={(v) => {
                setDistrictId(toNumber(v));
                setLocalLevelId(undefined);
                setWardId(undefined);
              }}
              placeholder={t('apply.choose')}
              options={provinceId === undefined ? [] : (districts.data ?? []).map((d) => ({ value: String(d.id), label: pickName(d, lang) }))}
              required
            />
            <SelectField
              label={t('apply.palika')}
              value={String(localLevelId ?? '')}
              disabled={districtId === undefined}
              onChange={(v) => {
                setLocalLevelId(toNumber(v));
                setWardId(undefined);
              }}
              placeholder={t('apply.choose')}
              options={(localLevels.data ?? []).map((l) => ({ value: String(l.id), label: pickName(l, lang) }))}
              required
            />
            <SelectField
              label={t('apply.ward')}
              value={String(wardId ?? '')}
              disabled={localLevelId === undefined}
              onChange={(v) => setWardId(toNumber(v))}
              placeholder={t('apply.choose')}
              options={(wards.data ?? []).map((w) => ({ value: String(w.id), label: `${t('apply.wardN')} ${w.number}` }))}
              error={errors.wardId}
              required
            />
          </fieldset>

          <fieldset className="flex flex-col gap-4 rounded-xl border border-line p-5">
            <legend className="px-1 font-bold">{t('apply.step3')}</legend>
            <TextAreaField
              label={t('apply.purpose')}
              hint={t('apply.purposeHint')}
              rows={3}
              maxLength={500}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              error={errors.purpose}
              required
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label={t('apply.name')} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="off" required />
              <TextField
                label={t('apply.nid')}
                hint={t('apply.nidHint')}
                value={nid}
                onChange={(e) => setNid(e.target.value.toUpperCase())}
                placeholder="DEMO-1234567"
                error={errors.nid}
                autoComplete="off"
                required
              />
            </div>
            <CheckboxField label={t('apply.consent')} checked={consent} onChange={(e) => setConsent(e.target.checked)} error={errors.consent} />
          </fieldset>

          {selectedService && (
            <fieldset className="flex flex-col gap-3 rounded-xl border border-line p-5">
              <legend className="px-1 font-bold">{t('apply.step4')}</legend>
              <p className="text-sm text-muted">{t('apply.docsIntro')}</p>
              {fileError && <Alert tone="error">{fileError}</Alert>}
              <ul className="flex flex-col divide-y divide-line">
                {selectedService.requiredDocuments.map((d) => {
                  const file = files[d.nameEn];
                  return (
                    <li key={d.nameEn} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <span className="flex min-w-0 flex-[1_1_220px] flex-col">
                        <span className="font-medium">{pickName(d, lang)}</span>
                        {file && (
                          <span className="text-sm text-muted">
                            {file.name} · {formatSize(file.size)}
                          </span>
                        )}
                      </span>
                      <span className="flex gap-2">
                        <FilePicker label={file ? t('docs.replace') : t('apply.attach')} onPick={(f) => attach(d.nameEn, f)} />
                        {file && (
                          <Button
                            variant="ghost"
                            onClick={() =>
                              setFiles((all) => {
                                const next = { ...all };
                                delete next[d.nameEn];
                                return next;
                              })
                            }
                          >
                            {t('apply.remove')}
                          </Button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-muted">{t('docs.rules')}</p>
            </fieldset>
          )}

          <Button type="submit" size="lg" loading={submit.isPending} className="self-start">
            {t('apply.submit')}
          </Button>
        </form>

        <aside aria-labelledby="bring-title" className="flex-[1_1_280px]">
          <Card className="flex flex-col gap-3">
            <h2 id="bring-title" className="text-lg font-bold text-primary">
              {t('apply.bring')}
            </h2>
            {selectedService ? (
              <>
                <ul className="list-disc pl-5 text-sm leading-7">
                  {selectedService.requiredDocuments.map((d) => (
                    <li key={d.nameEn}>{pickName(d, lang)}</li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <Badge>{selectedService.feeNpr === 0 ? t('services.free') : `NPR ${selectedService.feeNpr}`}</Badge>
                  <Badge>
                    {selectedService.serviceDays} {selectedService.serviceDays === 1 ? t('services.day') : t('services.days')}
                  </Badge>
                  {selectedService.requiresFieldVerification && <Badge tone="info">{t('services.fieldVisit')}</Badge>}
                </div>
                <p className="text-xs text-muted">{t('services.demoValues')}</p>
              </>
            ) : (
              <p className="text-sm text-muted">{t('apply.service')}</p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
