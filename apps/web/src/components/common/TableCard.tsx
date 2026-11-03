import type { ReactNode } from 'react';

/**
 * A table inside a card that scrolls on its own, so a long list doesn't make the whole page long.
 *   - the body scrolls inside `maxHeight` (both ways: wide tables scroll sideways on phones)
 *   - give the table's <thead> the `STICKY_HEAD` classes so the column names stay visible while scrolling
 *   - `footer`: e.g. the pagination buttons, outside the scrolling part
 * `tabIndex={0}` + a label on the scrolling box: keyboard users can focus it and scroll with the arrow keys.
 */
export const STICKY_HEAD = 'sticky top-0 z-10 bg-surface';

export function TableCard({
  title,
  titleId,
  label,
  actions,
  footer,
  maxHeight = 'max-h-[28rem]',
  dimmed = false,
  children,
}: {
  title?: ReactNode;
  titleId?: string;
  label: string; // what the scrolling box is, for screen readers ("Request queue")
  actions?: ReactNode; // shown on the right of the title
  footer?: ReactNode;
  maxHeight?: string;
  dimmed?: boolean; // the next page is loading: show the old one faded
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={titleId} className="flex flex-col overflow-hidden rounded-xl border border-line bg-white">
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          {title && (
            <h2 id={titleId} className="text-lg font-bold">
              {title}
            </h2>
          )}
          {actions}
        </div>
      )}
      <div tabIndex={0} role="region" aria-label={label} className={`relative overflow-auto ${maxHeight} ${dimmed ? 'opacity-60' : ''}`}>
        {children}
      </div>
      {footer && <div className="border-t border-line px-5 py-3">{footer}</div>}
    </section>
  );
}
