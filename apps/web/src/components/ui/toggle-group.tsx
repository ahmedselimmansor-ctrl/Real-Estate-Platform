'use client';

import * as React from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import type { VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import { toggleVariants } from './toggle';

/**
 * Segmented control — bedroom chips, grid/list/map layout switch, sale-type
 * tabs. Items share the group's `variant`/`size` unless they override them.
 */

type ToggleGroupContextValue = VariantProps<typeof toggleVariants> & { joined?: boolean };

const ToggleGroupContext = React.createContext<ToggleGroupContextValue>({
  variant: 'outline',
  size: 'default',
  joined: false,
});

type ToggleGroupProps = React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants> & {
    /** Render items as one connected pill row instead of separate chips. */
    joined?: boolean;
  };

const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  ToggleGroupProps
>(({ className, variant = 'outline', size = 'default', joined = false, children, ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    data-slot="toggle-group"
    data-variant={variant}
    data-size={size}
    className={cn(
      'flex w-fit items-center',
      joined
        ? 'gap-0 rounded-lg border border-input bg-background shadow-xs [&>*]:rounded-none [&>*]:border-0 [&>*]:shadow-none first:[&>*]:rounded-s-lg last:[&>*]:rounded-e-lg'
        : 'flex-wrap gap-2',
      className,
    )}
    {...props}
  >
    <ToggleGroupContext.Provider value={{ variant, size, joined }}>
      {children}
    </ToggleGroupContext.Provider>
  </ToggleGroupPrimitive.Root>
));
ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName;

type ToggleGroupItemProps = React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants>;

const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  ToggleGroupItemProps
>(({ className, children, variant, size, ...props }, ref) => {
  const context = React.useContext(ToggleGroupContext);

  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      data-slot="toggle-group-item"
      className={cn(
        toggleVariants({
          variant: variant ?? context.variant,
          size: size ?? context.size,
        }),
        context.joined && 'flex-1',
        className,
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
});
ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName;

export { ToggleGroup, ToggleGroupItem };
