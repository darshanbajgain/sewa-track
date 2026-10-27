'use client';

import type { ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';

/** Small shared building blocks so every page looks and behaves the same. */

export function PageTitle({ title, intro }: { title: string; intro?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl font-bold text-primary">{title}</h1>
      {intro && <p className="max-w-3xl text-muted">{intro}</p>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-white p-5 ${className}`}>{children}</div>;
}

/** Loading and error states for any query (PRD F8: loading state, empty state). */
export function QueryState({ isLoading, error, onRetry }: { isLoading: boolean; error: unknown; onRetry: () => void }) {
  const { t } = useI18n();
  if (isLoading) {
    return (
      <p role="status" className="text-muted">
        {t('common.loading')}
      </p>
    );
  }
  if (error) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-accent-soft p-4 text-sm text-accent">
        <span>{t('common.error')}</span>
        <button type="button" onClick={onRetry} className="min-h-11 rounded-md border border-accent px-3 font-semibold">
          {t('common.retry')}
        </button>
      </div>
    );
  }
  return null;
}
