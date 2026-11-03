'use client';

import type { RequestDetailDto } from '@sewa/shared';
import { Card } from '@/components/common';
import { useI18n } from '@/lib/i18n';
import { progressSteps, type StepState } from '@/lib/requestFlow';

const CIRCLE: Record<StepState, string> = {
  done: 'border-ok bg-ok text-white',
  current: 'border-primary bg-primary text-white',
  todo: 'border-line bg-white text-muted',
  stopped: 'border-accent bg-accent text-white',
};
const NOTE_TONE: Record<StepState, string> = { done: 'text-muted', current: 'text-warn', todo: 'text-muted', stopped: 'text-accent' };

/**
 * Where the request is on its path, as numbered steps (rules in lib/requestFlow.ts).
 * A row on wider screens, a column on phones. The current step has aria-current="step", and each step's
 * state is also written out for screen readers (colour alone never carries the meaning).
 */
export function RequestProgress({ request }: { request: RequestDetailDto }) {
  const { t } = useI18n();
  const steps = progressSteps(request);

  return (
    <Card as="section" aria-labelledby="progress-title">
      <h2 id="progress-title" className="sr-only">
        {t('staff.progress')}
      </h2>
      <ol className="flex flex-col gap-3 sm:flex-row sm:gap-0">
        {steps.map((step, i) => (
          <li key={step.status} aria-current={step.state === 'current' ? 'step' : undefined} className="flex flex-1 items-center gap-3 sm:flex-col sm:gap-2 sm:text-center">
            <div className="flex items-center sm:w-full">
              {/* the line between steps (desktop only) */}
              <span aria-hidden="true" className={`hidden h-0.5 flex-1 sm:block ${i === 0 ? 'invisible' : step.state === 'todo' ? 'bg-line' : 'bg-ok'}`} />
              <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${CIRCLE[step.state]}`}>
                {step.state === 'done' ? '✓' : step.state === 'stopped' ? '✕' : i + 1}
              </span>
              <span aria-hidden="true" className={`hidden h-0.5 flex-1 sm:block ${i === steps.length - 1 ? 'invisible' : steps[i + 1]!.state === 'todo' ? 'bg-line' : 'bg-ok'}`} />
            </div>
            <div className="flex flex-col">
              <span className={`text-sm font-semibold ${step.state === 'todo' ? 'text-muted' : 'text-ink'}`}>{t(`status.${step.status}`)}</span>
              {step.note && <span className={`text-xs font-semibold ${NOTE_TONE[step.state]}`}>{t(`status.${step.note}`)}</span>}
              <span className="sr-only">({t(`staff.step.${step.state}`)})</span>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
