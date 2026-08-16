// `buttonVariants` lives in a "use client" module, so this file must be one too
// — otherwise a server component rendering <PaginationLink> would call a client
// reference during SSR.
'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';

import { cn } from '@/lib/utils';
import { buttonVariants } from './button';

/**
 * Pagination controls for `?page=` navigation (CONTRACT §4).
 * `getPaginationRange` produces the classic `1 … 4 5 6 … 20` window.
 */

const Pagination = ({ className, ...props }: React.ComponentPropsWithoutRef<'nav'>) => (
  <nav
    role="navigation"
    aria-label="Pagination"
    data-slot="pagination"
    className={cn('mx-auto flex w-full justify-center', className)}
    {...props}
  />
);

const PaginationContent = React.forwardRef<HTMLUListElement, React.ComponentPropsWithoutRef<'ul'>>(
  ({ className, ...props }, ref) => (
    <ul
      ref={ref}
      data-slot="pagination-content"
      className={cn('flex flex-row items-center gap-1', className)}
      {...props}
    />
  ),
);
PaginationContent.displayName = 'PaginationContent';

const PaginationItem = React.forwardRef<HTMLLIElement, React.ComponentPropsWithoutRef<'li'>>(
  ({ className, ...props }, ref) => (
    <li ref={ref} data-slot="pagination-item" className={cn('', className)} {...props} />
  ),
);
PaginationItem.displayName = 'PaginationItem';

export interface PaginationLinkProps extends React.ComponentPropsWithoutRef<'a'> {
  isActive?: boolean;
  size?: 'icon-sm' | 'icon' | 'sm' | 'default';
  asChild?: boolean;
  disabled?: boolean;
}

function PaginationLink({
  className,
  isActive,
  size = 'icon',
  asChild,
  disabled,
  ...props
}: PaginationLinkProps) {
  const Comp = asChild ? Slot : 'a';
  return (
    <Comp
      data-slot="pagination-link"
      aria-current={isActive ? 'page' : undefined}
      aria-disabled={disabled || undefined}
      data-active={isActive || undefined}
      className={cn(
        buttonVariants({ variant: isActive ? 'default' : 'ghost', size }),
        'font-medium',
        !isActive && 'text-muted-foreground hover:text-foreground',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
      {...props}
    />
  );
}

function PaginationPrevious({
  className,
  label = 'Previous',
  ...props
}: PaginationLinkProps & { label?: string }) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      size="default"
      className={cn('gap-1 px-2.5', className)}
      {...props}
    >
      <ChevronLeft className="flip-rtl" aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
    </PaginationLink>
  );
}

function PaginationNext({
  className,
  label = 'Next',
  ...props
}: PaginationLinkProps & { label?: string }) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      size="default"
      className={cn('gap-1 px-2.5', className)}
      {...props}
    >
      <span className="hidden sm:inline">{label}</span>
      <ChevronRight className="flip-rtl" aria-hidden="true" />
    </PaginationLink>
  );
}

function PaginationEllipsis({ className, ...props }: React.ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      aria-hidden="true"
      data-slot="pagination-ellipsis"
      className={cn('flex size-10 items-center justify-center text-muted-foreground', className)}
      {...props}
    >
      <MoreHorizontal className="size-4" />
      <span className="sr-only">More pages</span>
    </span>
  );
}

export type PaginationEntry = number | 'ellipsis-start' | 'ellipsis-end';

/**
 * `getPaginationRange(6, 20)` → `[1, 'ellipsis-start', 5, 6, 7, 'ellipsis-end', 20]`
 * @param siblings how many page links to show either side of the current page
 */
export function getPaginationRange(
  page: number,
  totalPages: number,
  siblings = 1,
): PaginationEntry[] {
  const total = Math.max(0, Math.floor(totalPages));
  if (total <= 0) return [];

  const current = Math.min(Math.max(1, Math.floor(page)), total);
  const maxSlots = siblings * 2 + 5;

  if (total <= maxSlots) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const start = Math.max(current - siblings, 1);
  const end = Math.min(current + siblings, total);
  const showStartEllipsis = start > 2;
  const showEndEllipsis = end < total - 1;

  const entries: PaginationEntry[] = [1];
  if (showStartEllipsis) entries.push('ellipsis-start');

  for (let index = Math.max(start, 2); index <= Math.min(end, total - 1); index += 1) {
    entries.push(index);
  }

  if (showEndEllipsis) entries.push('ellipsis-end');
  entries.push(total);

  return entries;
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
};
