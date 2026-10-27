'use client';

import { useState, type FormEvent } from 'react';
import { ApiError } from '@/api/client';
import { Alert, Badge, Button, Card, Modal, PageTitle, Spinner, TextField } from '@/components/common';
import { useTracking } from '@/hooks/useTracking';
import { pickName, useI18n } from '@/lib/i18n';

/**
 * Public tracking (PRD F5). No login. The API returns only public fields; this page simply shows them.
 * The API also cleans the code (case, spaces, O→0, I/L→1), so the input is sent as typed.
 */
export default function TrackPage() {
  const { t, lang } = useI18n();
  const [input, setInput] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const tracking = useTracking(code); // only fetches after the form is submitted

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (input.trim()) setCode(input.trim());
  }

  const errorMessage = (() => {
    const err = tracking.error;
    if (!(err instanceof ApiError)) return err ? t('common.error') : null;
    if (err.code === 'VALIDATION_ERROR') return t('track.invalid');
    if (err.code === 'NOT_FOUND') return t('track.notFound');
    if (err.code === 'RATE_LIMITED') return t('track.tooMany');
    return t('common.error');
  })();

  const when = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'ne' ? 'ne-NP-u-nu-deva' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kathmandu' });

  const data = tracking.data;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <PageTitle title={t('track.title')} intro={t('track.intro')} />

      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3" noValidate>
        <div className="min-w-64 flex-1">
          <TextField
            id="code"
            label={t('track.label')}
            hint={t('track.hint')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ST-7K3QX9M2PD"
            autoComplete="off"
            spellCheck={false}
            className="font-mono tracking-wider uppercase"
          />
        </div>
        <Button type="submit" size="lg" loading={tracking.isFetching} className="mb-7">
          {t('track.button')}
        </Button>
      </form>
      <Button variant="ghost" onClick={() => setHelpOpen(true)} className="-mt-4 self-start px-0 underline">
        {t('track.helpButton')}
      </Button>

      {tracking.isFetching && (
        <p role="status" className="flex items-center gap-2 text-muted">
          <Spinner /> {t('common.loading')}
        </p>
      )}
      {errorMessage && <Alert tone="error">{errorMessage}</Alert>}

      {data && (
        <Card as="section" aria-label={data.trackingCode} className="flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-sm text-muted">{data.trackingCode}</p>
              <h2 className="text-xl font-bold text-primary">{pickName(data.service, lang)}</h2>
              <p className="text-sm text-muted">
                {pickName(data.palika, lang)} · {t('track.ward')} {data.ward.number}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge tone="info">{t(`status.${data.status}`)}</Badge>
              <Badge tone={data.overdue ? 'danger' : 'success'}>{data.overdue ? t('track.overdue') : t('track.onTime')}</Badge>
            </div>
          </div>

          <div>
            <h3 className="mb-2 font-semibold">{t('track.timeline')}</h3>
            <ol className="flex flex-col">
              {data.timeline.map((step, i) => (
                <li key={`${step.status}-${step.at}`} className="flex gap-3 pb-4 last:pb-0">
                  <span className="flex flex-col items-center" aria-hidden="true">
                    <span className="mt-1 h-3 w-3 rounded-full bg-primary" />
                    {i < data.timeline.length - 1 && <span className="w-px flex-1 bg-line" />}
                  </span>
                  <span className="flex flex-col">
                    <strong>{t(`status.${step.status}`)}</strong>
                    <span className="text-sm text-muted">{when(step.at)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <p className="text-sm text-muted">{t('track.privacy')}</p>
        </Card>
      )}

      <Modal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title={t('track.helpTitle')}
        closeLabel={t('common.close')}
        footer={<Button onClick={() => setHelpOpen(false)}>{t('track.helpOk')}</Button>}
      >
        <p>{t('track.helpBody')}</p>
      </Modal>
    </div>
  );
}
