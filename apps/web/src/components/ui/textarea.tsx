'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      data-slot="textarea"
      className={cn(
        'flex w-full min-h-20 rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground shadow-xs',
        'transition-[color,box-shadow,border-color] outline-none field-sizing-content resize-y',
        'placeholder:text-muted-foreground/80',
        'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-muted',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/25',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export { Textarea };
