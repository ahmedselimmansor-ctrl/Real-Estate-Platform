'use client';

import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cva, type VariantProps } from 'class-variance-authority';

import { clamp, cn } from '@/lib/utils';

const progressVariants = cva('relative w-full overflow-hidden rounded-full bg-muted', {
  variants: {
    size: {
      sm: 'h-1.5',
      default: 'h-2.5',
      lg: 'h-3.5',
    },
    tone: {
      brand: '[--progress-fill:var(--primary)]',
      success: '[--progress-fill:var(--success)]',
      warning: '[--progress-fill:var(--warning)]',
      featured: '[--progress-fill:var(--featured)]',
    },
  },
  defaultVariants: { size: 'default', tone: 'brand' },
});

export interface ProgressProps
  extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>,
    VariantProps<typeof progressVariants> {
  value?: number | null;
  max?: number;
}

/**
 * Determinate progress bar — payment plans, sold-percentage meters, uploads.
 * The indicator grows from the inline-start edge, so it flips correctly in RTL.
 */
const Progress = React.forwardRef<React.ElementRef<typeof ProgressPrimitive.Root>, ProgressProps>(
  ({ className, value, max = 100, size, tone, ...props }, ref) => {
    const percent = clamp(((value ?? 0) / (max || 100)) * 100, 0, 100);

    return (
      <ProgressPrimitive.Root
        ref={ref}
        data-slot="progress"
        value={value ?? 0}
        max={max}
        className={cn(progressVariants({ size, tone }), className)}
        {...props}
      >
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className="h-full rounded-full bg-(--progress-fill) transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </ProgressPrimitive.Root>
    );
  },
);
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress, progressVariants };
