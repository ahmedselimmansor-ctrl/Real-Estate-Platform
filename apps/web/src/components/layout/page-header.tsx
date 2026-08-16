import { cn } from '@/lib/utils';

interface PageHeaderProps {
  /** ReactNode so callers can pass a <T> for a localised string. */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  lede?: React.ReactNode;
  count?: number;
  countLabel?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Index-page masthead.
 *
 * The count sits in the mono face beside the title rather than in a sentence,
 * so a scanning reader gets the size of the set before they read anything.
 */
export function PageHeader({
  eyebrow,
  title,
  lede,
  count,
  countLabel,
  className,
  children,
}: PageHeaderProps) {
  return (
    <header className={cn('border-b border-border pb-8', className)}>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}

      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <h1 className="display text-4xl text-foreground sm:text-5xl">{title}</h1>

        {count !== undefined ? (
          <p className="figure text-sm text-muted-foreground">
            <span className="text-foreground">{count}</span> {countLabel}
          </p>
        ) : null}
      </div>

      {lede ? <p className="mt-4 max-w-2xl text-muted-foreground">{lede}</p> : null}
      {children}
    </header>
  );
}
