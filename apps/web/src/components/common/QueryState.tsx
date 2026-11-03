'use client';

import { ApiError } from '@/api/client';
import type { ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { Alert } from './Alert';
import { Button } from './Button';
import { Spinner } from './Spinner';

/**
 * Standard loading / error display for any query.
 * A 403 gets its own clear message ("no access") instead of a generic "try again".
 * `skeleton`: a placeholder in the shape of the coming content (see Skeleton.tsx), shown instead of the
 * spinner so the page doesn't jump when the data arrives. Screen readers still hear "Loading…".
 */
export function QueryState({
  isLoading,
  error,
  onRetry,
  skeleton,
}: {
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  skeleton?: ReactNode;
}) {
  const { t } = useI18n();
  if (isLoading && skeleton) {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">{t('common.loading')}</span>
        {skeleton}
      </div>
    );
  }
  if (isLoading) {
    return (
      <p role="status" className="flex items-center gap-2 text-muted">
        <Spinner /> {t('common.loading')}
      </p>
    );
  }
  if (!error) return null;
  if (error instanceof ApiError && error.status === 403) return <Alert tone="error">{t('common.forbidden')}</Alert>;
  return (
    <Alert
      tone="error"
      action={
        <Button variant="danger" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      }
    >
      {t('common.error')}
    </Alert>
  );
}
