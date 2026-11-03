'use client';

import { createRequestSchema, type ServiceTypeCode } from '@sewa/shared';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/api/client';
import type { CreatedRequest } from '@/api/requests.api';
import { Alert, Badge, Button, ButtonLink, Card, CheckboxField, PageTitle, SelectField, TextAreaField, TextField } from '@/components/common';
import { useDistricts, useLocalLevels, useProvinces, useServiceTypes, useWards } from '@/hooks/useReference';
import { useSubmitRequest } from '@/hooks/useRequests';
import { pickName, useI18n } from '@/lib/i18n';

/**
 * Apply (PRD F4). Cascading location dropdowns: each list loads only after its parent is chosen
 * (the hooks use `enabled`), and choosing a new parent clears the children.
 *
 * Validation runs twice on purpose:
 *   1. here, with the SAME Zod schema the API uses (instant feedback, no round trip)
 *   2. on the server (the real check; the browser can always be bypassed)
 */
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

  const services = useServiceTypes();
  const provinces = useProvinces();
  const districts = useDistricts(provinceId);
  const localLevels = useLocalLevels(districtId);
  const wards = useWards(localLevelId);
  const selectedService = services.data?.find((s) => s.code === service);

  const toNumber = (value: string) => (value ? Number(value) : undefined);

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
      onSuccess: (request) => setCreated(request),
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
              onChange={(v) => setService(v as ServiceTypeCode | '')}
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
