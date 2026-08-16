'use client';

import * as React from 'react';
import * as TogglePrimitive from '@radix-ui/react-toggle';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const toggleVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg',
    'text-sm font-medium transition-colors outline-none',
    'hover:bg-muted hover:text-foreground',
    'focus-visible:ring-2 focus-visible:ring-ring/50',
    'disabled:pointer-events-none disabled:opacity-50',
    'data-[state=on]:bg-primary-soft data-[state=on]:text-accent-foreground',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline:
          'border border-input bg-background shadow-xs data-[state=on]:border-primary/40',
        solid:
          'bg-muted text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground',
      },
      size: {
        sm: 'h-8 min-w-8 px-2 text-xs',
        default: 'h-10 min-w-10 px-3',
        lg: 'h-11 min-w-11 px-4',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ToggleProps
  extends React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root>,
    VariantProps<typeof toggleVariants> {}

const Toggle = React.forwardRef<React.ElementRef<typeof TogglePrimitive.Root>, ToggleProps>(
  ({ className, variant, size, ...props }, ref) => (
    <TogglePrimitive.Root
      ref={ref}
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Toggle.displayName = TogglePrimitive.Root.displayName;

export { Toggle, toggleVariants };
