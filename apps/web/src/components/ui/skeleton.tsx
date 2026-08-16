import * as React from 'react';

import { cn } from '@/lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds the sweeping highlight on top of the base pulse. */
  shimmer?: boolean;
}

/** Loading placeholder. Always give it an explicit size via `className`. */
function Skeleton({ className, shimmer = true, ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        'rounded-md bg-muted/80 animate-pulse',
        shimmer && 'shimmer animate-none',
        className,
      )}
      {...props}
    />
  );
}

/** Convenience: a block of text lines. */
function SkeletonText({
  lines = 3,
  className,
  ...props
}: SkeletonProps & { lines?: number }) {
  return (
    <div className={cn('flex flex-col gap-2', className)} {...props}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn('h-3.5 w-full', index === lines - 1 && 'w-2/3')}
        />
      ))}
    </div>
  );
}

export { Skeleton, SkeletonText };
