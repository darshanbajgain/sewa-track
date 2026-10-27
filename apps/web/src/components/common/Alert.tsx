import type { ReactNode } from 'react';

/**
 * Messages for the user. Screen readers announce them automatically:
 *   error   → role="alert"  (interrupts: something went wrong)
 *   others  → role="status" (polite: announced when the reader is idle)
 */
export type AlertTone = 'error' | 'success' | 'info' | 'warning';

const TONE: Record<AlertTone, string> = {
  error: 'bg-accent-soft text-accent',
  success: 'bg-ok-soft text-ok',
  info: 'bg-primary-soft text-primary',
  warning: 'bg-warn-soft text-warn',
};

export function Alert({ tone = 'info', children, action }: { tone?: AlertTone; children: ReactNode; action?: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex flex-wrap items-center gap-3 rounded-lg p-4 text-sm ${TONE[tone]}`}>
      <div className="flex-1">{children}</div>
      {action}
    </div>
  );
}
