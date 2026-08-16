'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap',
    'font-medium transition-all duration-200 select-none',
    'outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-50',
    'aria-disabled:pointer-events-none aria-disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary/95',
        brand:
          'brand-gradient text-white shadow-brand hover:brightness-[1.06] active:brightness-95',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline:
          'border border-border bg-background text-foreground shadow-xs hover:bg-muted hover:text-foreground',
        ghost: 'text-foreground hover:bg-muted hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        success: 'bg-success text-success-foreground shadow-sm hover:bg-success/90',
        featured: 'bg-featured text-featured-foreground shadow-sm hover:bg-featured/90',
        soft: 'bg-primary-soft text-accent-foreground hover:bg-primary-soft/70',
      },
      size: {
        xs: 'h-8 rounded-md px-2.5 text-xs [&_svg]:size-3.5',
        sm: 'h-9 rounded-lg px-3 text-sm [&_svg]:size-4',
        default: 'h-10 rounded-lg px-4 text-sm [&_svg]:size-4',
        lg: 'h-11 rounded-xl px-6 text-[15px] [&_svg]:size-[18px]',
        xl: 'h-13 rounded-xl px-8 text-base [&_svg]:size-5',
        icon: 'size-10 rounded-lg [&_svg]:size-[18px]',
        'icon-sm': 'size-9 rounded-lg [&_svg]:size-4',
        'icon-lg': 'size-11 rounded-xl [&_svg]:size-5',
      },
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render as the single child element (e.g. a `<Link>`). */
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, fullWidth, asChild = false, loading = false, children, disabled, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        ref={ref}
        data-slot="button"
        data-loading={loading || undefined}
        className={cn(buttonVariants({ variant, size, fullWidth }), className)}
        disabled={asChild ? undefined : disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {/*
          With `asChild`, Radix's `Slot` calls `Children.only`, and a literal
          `null` still counts as a child, so `[null, children]` throws
          "Slot failed to slot onto its children". The spinner is therefore
          omitted entirely (not rendered as null) whenever `asChild` is set.
        */}
        {asChild ? (
          children
        ) : (
          <>
            {loading ? (
              <svg
                className="animate-spin-slow size-4"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeOpacity="0.25"
                  strokeWidth="3"
                />
                <path
                  d="M21 12a9 9 0 0 0-9-9"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            ) : null}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
