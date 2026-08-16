import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const spinnerVariants = cva('animate-spin-slow', {
  variants: {
    size: {
      xs: 'size-3',
      sm: 'size-4',
      default: 'size-5',
      lg: 'size-8',
      xl: 'size-12',
    },
    tone: {
      default: 'text-primary',
      muted: 'text-muted-foreground',
      current: 'text-current',
      inverted: 'text-primary-foreground',
    },
  },
  defaultVariants: { size: 'default', tone: 'default' },
});

export interface SpinnerProps
  extends React.SVGAttributes<SVGSVGElement>,
    VariantProps<typeof spinnerVariants> {
  label?: string;
}

/** Accessible loading indicator (`role="status"` + visually-hidden label). */
function Spinner({ className, size, tone, label = 'Loading', ...props }: SpinnerProps) {
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-2">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        data-slot="spinner"
        className={cn(spinnerVariants({ size, tone }), className)}
        {...props}
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export { Spinner, spinnerVariants };
