'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const inputVariants = cva(
  [
    'flex w-full min-w-0 rounded-lg border border-input bg-background text-foreground',
    'shadow-xs transition-[color,box-shadow,border-color] outline-none',
    'placeholder:text-muted-foreground/80',
    'file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
    'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35',
    'disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-muted',
    'aria-invalid:border-destructive aria-invalid:ring-destructive/25',
  ].join(' '),
  {
    variants: {
      inputSize: {
        sm: 'h-9 px-3 py-1 text-sm',
        default: 'h-10 px-3.5 py-2 text-sm',
        lg: 'h-12 px-4 py-2 text-base',
      },
    },
    defaultVariants: { inputSize: 'default' },
  },
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  /** Renders inside the field, before the text (search icon, currency, …). */
  startAdornment?: React.ReactNode;
  endAdornment?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', inputSize, startAdornment, endAdornment, ...props }, ref) => {
    const field = (
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          inputVariants({ inputSize }),
          startAdornment && 'ps-10',
          endAdornment && 'pe-10',
          className,
        )}
        {...props}
      />
    );

    if (!startAdornment && !endAdornment) return field;

    return (
      <div className="relative w-full">
        {startAdornment ? (
          <span
            className="pointer-events-none absolute inset-y-0 start-0 flex w-10 items-center justify-center text-muted-foreground [&_svg]:size-4"
            aria-hidden="true"
          >
            {startAdornment}
          </span>
        ) : null}
        {field}
        {endAdornment ? (
          <span className="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-muted-foreground [&_svg]:size-4">
            {endAdornment}
          </span>
        ) : null}
      </div>
    );
  },
);
Input.displayName = 'Input';

export { Input, inputVariants };
