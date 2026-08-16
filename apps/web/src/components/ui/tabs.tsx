'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/** Tabs — `underline` for page sections, `pill` for compact segmented controls. */

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Root
    ref={ref}
    data-slot="tabs"
    className={cn('flex flex-col gap-4', className)}
    {...props}
  />
));
Tabs.displayName = TabsPrimitive.Root.displayName;

const tabsListVariants = cva('inline-flex items-center', {
  variants: {
    variant: {
      pill: 'h-10 w-fit justify-center gap-1 rounded-xl bg-muted p-1 text-muted-foreground',
      underline:
        'w-full justify-start gap-6 overflow-x-auto border-b border-border text-muted-foreground scrollbar-none',
    },
  },
  defaultVariants: { variant: 'pill' },
});

const tabsTriggerVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap text-sm font-medium',
    'transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        pill: [
          'h-8 rounded-lg px-3',
          'data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs',
          'hover:text-foreground',
        ].join(' '),
        underline: [
          'h-11 border-b-2 border-transparent px-0.5 -mb-px',
          'data-[state=active]:border-primary data-[state=active]:text-foreground',
          'hover:text-foreground',
        ].join(' '),
      },
    },
    defaultVariants: { variant: 'pill' },
  },
);

type TabsVariant = 'pill' | 'underline';

const TabsVariantContext = React.createContext<TabsVariant>('pill');

export interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>,
    VariantProps<typeof tabsListVariants> {}

const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, TabsListProps>(
  ({ className, variant, ...props }, ref) => (
    <TabsVariantContext.Provider value={(variant ?? 'pill') as TabsVariant}>
      <TabsPrimitive.List
        ref={ref}
        data-slot="tabs-list"
        className={cn(tabsListVariants({ variant }), className)}
        {...props}
      />
    </TabsVariantContext.Provider>
  ),
);
TabsList.displayName = TabsPrimitive.List.displayName;

export interface TabsTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>,
    VariantProps<typeof tabsTriggerVariants> {}

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, variant, ...props }, ref) => {
  const inherited = React.useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      data-slot="tabs-trigger"
      className={cn(tabsTriggerVariants({ variant: variant ?? inherited }), className)}
      {...props}
    />
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    data-slot="tabs-content"
    className={cn('flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50', className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants, tabsTriggerVariants };
