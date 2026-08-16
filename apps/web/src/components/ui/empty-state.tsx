import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

const emptyStateVariants = cva(
  'flex w-full flex-col items-center justify-center text-center',
  {
    variants: {
      size: {
        sm: 'gap-2 px-4 py-8',
        default: 'gap-3 px-6 py-14',
        lg: 'gap-4 px-6 py-20',
      },
      bordered: {
        true: 'rounded-2xl border border-dashed border-border bg-surface/60',
        false: '',
      },
    },
    defaultVariants: { size: 'default', bordered: true },
  },
);

export interface EmptyStateProps
  // `title` is omitted from the DOM props: the native attribute is a string,
  // while this component renders a ReactNode heading.
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>,
    VariantProps<typeof emptyStateVariants> {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Primary + secondary CTAs. */
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
}

/** "No properties match these filters" / "Nothing saved yet" placeholder. */
const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    {
      className,
      size,
      bordered,
      icon: Icon,
      title,
      description,
      action,
      secondaryAction,
      children,
      ...props
    },
    ref,
  ) => (
    <div
      ref={ref}
      data-slot="empty-state"
      className={cn(emptyStateVariants({ size, bordered }), className)}
      {...props}
    >
      {Icon ? (
        <span
          className="mb-1 flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary"
          aria-hidden="true"
        >
          <Icon className="size-6" />
        </span>
      ) : null}

      <h3 className="text-base font-semibold text-foreground text-balance">{title}</h3>

      {description ? (
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground text-pretty">
          {description}
        </p>
      ) : null}

      {action || secondaryAction ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}

      {children}
    </div>
  ),
);
EmptyState.displayName = 'EmptyState';

export { EmptyState, emptyStateVariants };
