'use client';

import { useState, type FormEvent } from 'react';
import { ApiError } from '@/api/client';
import { Card, PageTitle } from '@/components/ui';
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

      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-64 flex-1 flex-col gap-1">
          <label htmlFor="code" className="text-sm font-semibold">
            {t('track.label')}
          </label>
          <input
            id="code"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ST-7K3QX9M2PD"
            autoComplete="off"
            spellCheck={false}
            aria-describedby="code-hint"
            className="min-h-12 rounded-md border border-muted px-3 font-mono tracking-wider uppercase"
          />
        </div>
        <button type="submit" className="min-h-12 rounded-md bg-primary px-6 font-semibold text-white hover:bg-primary-dark">
          {t('track.button')}
        </button>
      </form>
      <p id="code-hint" className="-mt-4 text-sm text-muted">
        {t('track.hint')}
      </p>

      {tracking.isFetching && (
        <p role="status" className="text-muted">
          {t('common.loading')}
        </p>
      )}
      {errorMessage && (
        <p role="alert" className="rounded-md bg-accent-soft p-4 text-accent">
          {errorMessage}
        </p>
      )}

      {data && (
        <Card className="flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-sm text-muted">{data.trackingCode}</p>
              <h2 className="text-xl font-bold text-primary">{pickName(data.service, lang)}</h2>
              <p className="text-sm text-muted">
                {pickName(data.palika, lang)} · {t('track.ward')} {data.ward.number}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="rounded-full bg-primary-soft px-3 py-1 text-sm font-semibold text-primary">{t(`status.${data.status}`)}</span>
              <span
                className={`rounded-full px-3 py-1 text-sm font-semibold ${data.overdue ? 'bg-accent-soft text-accent' : 'bg-ok-soft text-ok'}`}
              >
                {data.overdue ? t('track.overdue') : t('track.onTime')}
              </span>
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
    </div>
  );
}
