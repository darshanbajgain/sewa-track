'use client';

import { MAX_DOCUMENTS_PER_ASK, type RequestDetailDto } from '@sewa/shared';
import { useId, useState } from 'react';
import { Button, CheckboxField, TextField } from '@/components/common';
import { useServiceTypes } from '@/hooks/useReference';
import { pickName, useI18n } from '@/lib/i18n';

/**
 * Inside the "Ask for documents" dialog (PRD F15): which documents the citizen must upload.
 * Tick names from the service's list, and/or type your own ("Ward recommendation letter").
 * Each name becomes an upload box for the citizen. 1–5 names; the API checks the same rule.
 */
export function AskDocumentsField({
  request,
  value,
  onChange,
  error,
}: {
  request: RequestDetailDto;
  value: string[];
  onChange: (names: string[]) => void;
  error?: string;
}) {
  const { t, lang } = useI18n();
  const errorId = useId();
  const [custom, setCustom] = useState('');
  const listed = useServiceTypes().data?.find((s) => s.code === request.service.code)?.requiredDocuments ?? [];
  // Names typed by the officer (or asked earlier) that are not in the service's list.
  const extra = value.filter((name) => !listed.some((d) => d.nameEn === name));
  const full = value.length >= MAX_DOCUMENTS_PER_ASK;

  const toggle = (name: string, on: boolean) => onChange(on ? [...value, name] : value.filter((n) => n !== name));

  function addCustom() {
    const name = custom.trim();
    if (name.length < 2 || full) return;
    if (!value.some((n) => n.toLowerCase() === name.toLowerCase())) onChange([...value, name]);
    setCustom('');
  }

  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={error ? errorId : undefined}>
      <legend className="mb-1 font-semibold">{t('ask.which')}</legend>
      {[...listed.map((d) => ({ name: d.nameEn, label: pickName(d, lang) })), ...extra.map((name) => ({ name, label: name }))].map((d) => (
        <CheckboxField
          key={d.name}
          label={d.label}
          checked={value.includes(d.name)}
          disabled={full && !value.includes(d.name)}
          onChange={(e) => toggle(d.name, e.target.checked)}
        />
      ))}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-[1_1_220px]">
          <TextField
            label={t('ask.other')}
            value={custom}
            maxLength={200}
            disabled={full}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault(); // Enter adds the name instead of confirming the whole dialog
                addCustom();
              }
            }}
          />
        </div>
        <Button variant="secondary" disabled={full || custom.trim().length < 2} onClick={addCustom}>
          {t('ask.add')}
        </Button>
      </div>
      <p className="text-sm text-muted">{t('ask.limit')}</p>
      {error && (
        <p id={errorId} className="text-sm font-semibold text-accent">
          {error}
        </p>
      )}
    </fieldset>
  );
}
