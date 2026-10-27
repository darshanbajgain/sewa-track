'use client';

import { ApiError } from '@/api/client';
import { useI18n } from '@/lib/i18n';
import { Alert } from './Alert';
import { Button } from './Button';
import { Spinner } from './Spinner';

/**
 * Standard loading / error display for any query.
 * A 403 gets its own clear message ("no access") instead of a generic "try again".
 */
export function QueryState({ isLoading, error, onRetry }: { isLoading: boolean; error: unknown; onRetry: () => void }) {
  const { t } = useI18n();
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
