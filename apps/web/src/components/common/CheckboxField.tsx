'use client';

import { useId, type InputHTMLAttributes } from 'react';

/**
 * Checkbox with its label to the right (the whole label is clickable) and an optional error,
 * linked with aria-describedby / aria-invalid like the other fields.
 */
type CheckboxFieldProps = { label: string; error?: string | undefined } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function CheckboxField({ label, error, id: idProp, ...rest }: CheckboxFieldProps) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
        <input
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
          {...rest}
        />
        <span className="text-sm">{label}</span>
      </label>
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-accent">
          {error}
        </p>
      )}
    </div>
  );
}
