'use client';

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

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

function FieldShell({ id, label, hint, error, required, children }: FieldShellProps) {
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

const fieldClasses = (error?: string) =>
  `min-h-12 rounded-md border bg-white px-3 ${error ? 'border-accent' : 'border-muted'} disabled:bg-surface`;

function describedBy(id: string, hint?: string, error?: string) {
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

export function SelectField({ label, hint, error, id: idProp, className = '', children, ...rest }: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={rest.required}>
      <select id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} className={`${fieldClasses(error)} ${className}`} {...rest}>
        {children}
      </select>
    </FieldShell>
  );
}
