/**
 * Loading placeholders in the SHAPE of the content that is coming, so the page doesn't jump when the
 * data arrives (a spinner line is short; the real table is tall).
 * Decorative only (aria-hidden): QueryState adds one "Loading…" status text for screen readers.
 * `motion-reduce:animate-none`: no pulsing for people who asked their system for less motion.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`block animate-pulse rounded-md bg-line/70 motion-reduce:animate-none ${className}`} />;
}

/** A table-shaped placeholder: a header bar and `rows` rows of `cols` cells. */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="bg-surface p-3">
        <Skeleton className="h-4 w-1/3" />
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4 border-t border-line p-3">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** `count` card-shaped placeholders in the given grid (e.g. the service cards). */
export function SkeletonCards({ count = 3, className = '', cardClassName = 'h-40' }: { count?: number; className?: string; cardClassName?: string }) {
  return (
    <div aria-hidden="true" className={className}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={`rounded-xl ${cardClassName}`} />
      ))}
    </div>
  );
}
