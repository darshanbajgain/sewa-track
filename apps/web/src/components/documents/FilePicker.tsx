'use client';

import { DOCUMENT_CONTENT_TYPES, MAX_DOCUMENT_BYTES } from '@sewa/shared';
import { useRef } from 'react';
import { Button, type ButtonVariant } from '@/components/common';
import type { MessageKey } from '@/lib/i18n';

/**
 * Quick check in the browser before uploading, so the citizen gets an answer at once.
 * Only a convenience: the API checks again from the file's real bytes.
 */
export function fileProblem(file: File): MessageKey | null {
  if (!(DOCUMENT_CONTENT_TYPES as readonly string[]).includes(file.type)) return 'docs.err.type';
  if (file.size > MAX_DOCUMENT_BYTES) return 'docs.err.size';
  return null;
}

/**
 * A normal button that opens the file chooser. The real <input type="file"> is hidden (it can't be
 * styled), and the button clicks it, so keyboard and screen-reader users get an ordinary button.
 */
export function FilePicker({
  label,
  onPick,
  variant = 'secondary',
  loading,
  disabled,
  describedBy,
}: {
  label: string;
  onPick: (file: File) => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  describedBy?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ''; // so choosing the same file again still fires onChange
          if (file) onPick(file);
        }}
      />
      <Button variant={variant} loading={loading} disabled={disabled} aria-describedby={describedBy} onClick={() => input.current?.click()}>
        {label}
      </Button>
    </>
  );
}

export const formatSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
