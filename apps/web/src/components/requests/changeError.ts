import { ApiError } from '@/api/client';
import type { useI18n } from '@/lib/i18n';

type T = ReturnType<typeof useI18n>['t'];

/**
 * Text for a failed status change / fee payment. 409 CONFLICT gets its own message: someone else saved
 * first (optimistic locking), and the hook has already refetched the latest version.
 * Other API errors show the server's safe message; network errors a generic one.
 */
export function changeErrorText(error: unknown, t: T): string | null {
  if (!error) return null;
  if (error instanceof ApiError) return error.code === 'CONFLICT' ? t('detail.conflict') : error.message;
  return t('common.error');
}
