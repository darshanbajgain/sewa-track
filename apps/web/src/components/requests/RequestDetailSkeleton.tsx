import { Skeleton } from '@/components/common';

/** Placeholder in the shape of a request detail page (citizen and staff): title, a wide card, two cards side by side. */
export function RequestDetailSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-9 w-2/3 max-w-md" />
      </div>
      <Skeleton className="h-28 rounded-xl" />
      <div className="flex flex-wrap gap-6">
        <Skeleton className="h-56 flex-[2_1_420px] rounded-xl" />
        <Skeleton className="h-56 flex-[1_1_280px] rounded-xl" />
      </div>
    </div>
  );
}
