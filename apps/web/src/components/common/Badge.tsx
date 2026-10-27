import type { ReactNode } from 'react';

/** Small coloured label (status, overdue, on time). Colour is never the only signal: the text says it too. */
export type BadgeTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const TONE: Record<BadgeTone, string> = {
  info: 'bg-primary-soft text-primary',
  success: 'bg-ok-soft text-ok',
  warning: 'bg-warn-soft text-warn',
  danger: 'bg-accent-soft text-accent',
  neutral: 'bg-surface text-ink',
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${TONE[tone]}`}>{children}</span>;
}
