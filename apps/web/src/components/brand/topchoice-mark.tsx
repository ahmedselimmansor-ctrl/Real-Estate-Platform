import { cn } from '@/lib/utils';

/**
 * The TopChoice mark: a roof with a check beneath it.
 *
 * The two halves of the name are the two halves of the drawing. The roofline
 * says property, the check says chosen, and together they read as one glyph
 * rather than a house with a badge stuck on it.
 *
 * Drawn rather than shipped as a raster so it stays sharp at any size and
 * takes its colour from the theme: `currentColor` for the roof, so the mark
 * inverts correctly on the dark header instead of needing a light plate
 * underneath it.
 */
export function TopChoiceMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      role="img"
      aria-hidden
      className={cn('shrink-0', className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="40" height="40" rx="11" className="fill-primary" />

      {/* roofline */}
      <path
        d="M10 19.5 20 11.5l10 8"
        fill="none"
        stroke="var(--primary-foreground, #fff)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* the check, sitting where the front door would be */}
      <path
        d="m15.2 23.6 3.4 3.4 6.2-6.6"
        fill="none"
        stroke="var(--primary-foreground, #fff)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Mark plus wordmark. The wordmark is real text, not paths, so it picks up the
 * display face, stays selectable, and can be swapped for the Arabic name
 * without redrawing anything.
 */
export function TopChoiceLockup({
  className,
  markClassName,
  wordmarkClassName,
  name = 'TopChoice',
}: {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  name?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <TopChoiceMark className={markClassName} />
      <span
        className={cn(
          'display text-[1.0625rem] leading-none font-semibold tracking-tight',
          wordmarkClassName,
        )}
      >
        {name}
      </span>
    </span>
  );
}
