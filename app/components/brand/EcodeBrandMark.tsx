/**
 * E-Code brand mark — a self-contained inline SVG (orange gradient disc + the
 * "E›" glyph in white) plus the optional "E-Code" wordmark. Inline SVG with no
 * external file fetch and no external CSS, so it renders identically in every
 * surface (marketing header, login, dashboard/user area) — fixing the cases
 * where an <img src> logo failed to load or size. Matches EcodeLogo in the
 * marketing shell.
 */

const SIZES = {
  xs: { icon: 'h-6 w-6', text: 'text-base' },
  sm: { icon: 'h-7 w-7', text: 'text-[15px]' },
  md: { icon: 'h-9 w-9', text: 'text-xl' },
  lg: { icon: 'h-11 w-11', text: 'text-2xl' },
} as const;

export function EcodeBrandMark({
  size = 'md',
  showText = true,
  className,
  gradientId = 'ecode-brand-gradient',
}: {
  size?: keyof typeof SIZES;
  showText?: boolean;
  className?: string;

  /** Unique per surface to avoid duplicate SVG gradient ids on one page. */
  gradientId?: string;
}) {
  const resolved = SIZES[size] ?? SIZES.md;

  return (
    <span className={`inline-flex flex-row items-center gap-2 whitespace-nowrap ${className ?? ''}`}>
      <svg
        className={`${resolved.icon} shrink-0`}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="20" cy="20" r="20" fill={`url(#${gradientId})`} />
        <path
          d="M14 12 L14 20 L14 28 M14 12 L22 12 M14 20 L20 20 M14 28 L22 28"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M26 16 L30 20 L26 24" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="40" y2="40">
            <stop offset="0%" stopColor="#F26207" />
            <stop offset="100%" stopColor="#F99D25" />
          </linearGradient>
        </defs>
      </svg>
      {showText ? <span className={`font-bold ${resolved.text}`}>E-Code</span> : null}
    </span>
  );
}

export default EcodeBrandMark;
