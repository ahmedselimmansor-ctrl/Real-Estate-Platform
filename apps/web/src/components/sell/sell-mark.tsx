/**
 * The house-with-a-price-tag mark that heads the sell page.
 *
 * Drawn rather than imported so it takes the brand colours from CSS variables
 * and stays crisp at any size. Two tones: the house in the ink, the tag in the
 * accent, matching how the rest of the page splits emphasis.
 */
export function SellMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 84"
      role="img"
      aria-hidden
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* roof */}
      <path
        d="M48 4 92 38h-13v42a4 4 0 0 1-4 4H21a4 4 0 0 1-4-4V38H4L48 4Z"
        className="fill-primary"
      />
      {/* the doorway, punched out so the silhouette reads at small sizes */}
      <rect x="30" y="52" width="15" height="32" rx="2" className="fill-background" />
      {/* the price tag, hung across the facade */}
      <g transform="rotate(-12 62 48)">
        <rect x="44" y="38" width="42" height="24" rx="6" className="fill-accent" />
        <circle cx="53" cy="46" r="3" className="fill-background" />
        <text
          x="68"
          y="55"
          textAnchor="middle"
          className="fill-background"
          style={{ font: '700 13px var(--font-display, system-ui)', letterSpacing: '0.04em' }}
        >
          SALE
        </text>
      </g>
    </svg>
  );
}
