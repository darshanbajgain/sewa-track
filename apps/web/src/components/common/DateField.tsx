'use client';

import * as Popover from '@radix-ui/react-popover';
import { useId, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { formatDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { describedBy, FieldShell, fieldClasses } from './FormField';

interface DateFieldProps {
  label: string;
  value: string; // 'YYYY-MM-DD', or '' for no date
  onChange: (value: string) => void;
  min?: string; // 'YYYY-MM-DD'
  max?: string;
  hint?: string | undefined;
  error?: string | undefined;
  id?: string;
}

// A calendar day as 'YYYY-MM-DD' ↔ a local Date at midnight. No time zones involved: it is a day, not a moment.
const toDate = (value: string) => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
};
const toValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Date picker: a field-styled button that opens a calendar (react-day-picker) in a Radix Popover.
 * Replaces <input type="date">, whose look and format differ in every browser (mm/dd/yyyy in the screenshot).
 * The popover is portalled and flips to stay on screen, like the Select. Value stays 'YYYY-MM-DD', the same
 * string the API filters take, so callers didn't change.
 */
export function DateField({ label, value, onChange, min, max, hint, error, id: idProp }: DateFieldProps) {
  const { t, lang } = useI18n();
  const generated = useId();
  const id = idProp ?? generated;
  const [open, setOpen] = useState(false);
  const selected = value ? toDate(value) : undefined;
  const disabled = [...(min ? [{ before: toDate(min) }] : []), ...(max ? [{ after: toDate(max) }] : [])];

  function choose(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={`${fieldClasses(error)} flex items-center justify-between gap-2 text-left data-[state=open]:border-primary data-[state=open]:ring-4 data-[state=open]:ring-primary/20`}
        >
          {/* Noon UTC is the same calendar day in Nepal, so formatDate (Asia/Kathmandu) shows the chosen day. */}
          <span className={value ? '' : 'text-muted'}>{value ? formatDate(`${value}T12:00:00Z`, lang) : t('date.choose')}</span>
          <CalendarIcon />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content sideOffset={4} collisionPadding={8} align="start" className="z-[1100] rounded-md border border-line bg-white p-3 shadow-lg outline-none">
            <DayPicker
              mode="single"
              selected={selected}
              defaultMonth={selected}
              onSelect={(date) => date && choose(toValue(date))}
              disabled={disabled}
              showOutsideDays
            />
            <div className="mt-2 flex justify-between border-t border-line pt-2">
              <button type="button" className="rounded px-2 py-1 text-sm font-semibold text-primary hover:bg-primary-soft" onClick={() => choose('')}>
                {t('date.clear')}
              </button>
              <button type="button" className="rounded px-2 py-1 text-sm font-semibold text-primary hover:bg-primary-soft" onClick={() => choose(toValue(new Date()))}>
                {t('date.today')}
              </button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </FieldShell>
  );
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0 text-muted">
      <rect x="2.5" y="3.5" width="13" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 7.5h13M6 2v3M12 2v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
