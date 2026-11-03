'use client';

import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

/**
 * Accessible form fields: every input has a visible <label>, optional hint and error text, wired with
 * `aria-describedby` (the reader reads them) and `aria-invalid` (the reader says "invalid").
 * The id is generated with useId(), so two fields can never clash.
 */
interface FieldShellProps {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  children: ReactNode;
}

export function FieldShell({ id, label, hint, error, required, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
        {required && (
          <span className="text-accent" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-accent">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * One look for every form control (text, textarea, select, date): a grey border that darkens on hover and
 * turns blue with a soft blue ring on focus (red for an error). `outline-none` because the ring IS the focus
 * indicator: before, the browser outline was drawn outside the border, so focused fields had two lines.
 * `border-field` is darker than `border-line` so the box itself passes the 3:1 contrast rule (WCAG 1.4.11).
 */
export const fieldClasses = (error?: string) =>
  `min-h-12 w-full rounded-md border bg-white px-3 text-ink outline-none transition-[border-color,box-shadow] hover:border-muted focus-visible:ring-4 disabled:cursor-not-allowed disabled:bg-surface ${
    error ? 'border-accent focus-visible:border-accent focus-visible:ring-accent/20' : 'border-field focus-visible:border-primary focus-visible:ring-primary/20'
  }`;

export function describedBy(id: string, hint?: string, error?: string) {
  return [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
}

type Common = { label: string; hint?: string | undefined; error?: string | undefined };

export function TextField({ label, hint, error, id: idProp, className = '', ...rest }: Common & InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={rest.required}>
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} className={`${fieldClasses(error)} ${className}`} {...rest} />
    </FieldShell>
  );
}

export function TextAreaField({ label, hint, error, id: idProp, className = '', ...rest }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={rest.required}>
      <textarea id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} className={`${fieldClasses(error)} py-2 ${className}`} {...rest} />
    </FieldShell>
  );
}
