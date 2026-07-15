import { useId, type SVGProps } from 'react';

export type EcodeBootMarkTheme = 'auto' | 'light' | 'dark';

export interface EcodeBootMarkProps
  extends Omit<SVGProps<SVGSVGElement>, 'aria-hidden' | 'aria-label' | 'aria-labelledby' | 'children' | 'role'> {
  /**
   * `auto` follows the nearest `data-theme="light|dark"` ancestor before
   * hydration, then falls back to the operating-system preference. The server
   * safe fallback is dark, which is also E-Code's default theme.
   */
  theme?: EcodeBootMarkTheme;

  /**
   * The mark is decorative by default because boot containers already expose a
   * loading status. Supply a label only when the SVG must be announced alone.
   */
  label?: string;
}

/*
 * This stylesheet deliberately lives inside the SVG. The pre-hydration shell
 * can therefore choose the correct mark without waiting for application CSS or
 * issuing an asset request. Explicit light/dark props always win; `auto` uses
 * an SSR document theme when present and the OS preference otherwise.
 */
const BOOT_MARK_THEME_STYLES = `
  [data-ecode-boot-mark] [data-ecode-mark-variant] {
    display: none;
  }

  [data-ecode-boot-mark][data-theme-variant="light"] [data-ecode-mark-variant="light"],
  [data-ecode-boot-mark][data-theme-variant="dark"] [data-ecode-mark-variant="dark"],
  [data-ecode-boot-mark][data-theme-variant="auto"] [data-ecode-mark-variant="dark"] {
    display: inline;
  }

  [data-theme="light"] [data-ecode-boot-mark][data-theme-variant="auto"] [data-ecode-mark-variant="dark"] {
    display: none;
  }

  [data-theme="light"] [data-ecode-boot-mark][data-theme-variant="auto"] [data-ecode-mark-variant="light"] {
    display: inline;
  }

  [data-theme="dark"] [data-ecode-boot-mark][data-theme-variant="auto"] [data-ecode-mark-variant="light"] {
    display: none;
  }

  [data-theme="dark"] [data-ecode-boot-mark][data-theme-variant="auto"] [data-ecode-mark-variant="dark"] {
    display: inline;
  }

  @media (prefers-color-scheme: light) {
    :root:not([data-theme]) [data-ecode-boot-mark][data-theme-variant="auto"] [data-ecode-mark-variant="dark"] {
      display: none;
    }

    :root:not([data-theme]) [data-ecode-boot-mark][data-theme-variant="auto"] [data-ecode-mark-variant="light"] {
      display: inline;
    }
  }
`;

const ECODE_GLYPH_PATH = 'M14 12 L14 20 L14 28 M14 12 L22 12 M14 20 L20 20 M14 28 L22 28';
const ECODE_CHEVRON_PATH = 'M26 16 L30 20 L26 24';

/**
 * Self-contained E-Code boot mark for SSR and pre-hydration surfaces.
 *
 * The canonical E + code-chevron geometry is duplicated into explicit light
 * and dark layers. Keeping both layers in the server markup prevents a blank or
 * legacy-logo flash while the persisted theme is reconciled. There are no
 * `<img>`, `<image>`, external `<use>`, font, or stylesheet dependencies.
 */
export function EcodeBootMark({ theme = 'auto', label, width = 48, height = 48, ...svgProps }: EcodeBootMarkProps) {
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const lightGradientId = `ecode-boot-light-${instanceId}`;
  const darkGradientId = `ecode-boot-dark-${instanceId}`;
  const titleId = `ecode-boot-title-${instanceId}`;

  return (
    <svg
      {...svgProps}
      width={width}
      height={height}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="geometricPrecision"
      focusable="false"
      data-ecode-boot-mark=""
      data-theme-variant={theme}
      role={label ? 'img' : undefined}
      aria-labelledby={label ? titleId : undefined}
      aria-hidden={label ? undefined : true}
    >
      {label ? <title id={titleId}>{label}</title> : null}
      <style>{BOOT_MARK_THEME_STYLES}</style>
      <defs>
        <linearGradient id={lightGradientId} x1="5" y1="3" x2="35" y2="37" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E65300" />
          <stop offset="1" stopColor="#F77F12" />
        </linearGradient>
        <linearGradient id={darkGradientId} x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F26207" />
          <stop offset="1" stopColor="#F99D25" />
        </linearGradient>
      </defs>

      <g data-ecode-mark-variant="light">
        <circle cx="20" cy="20" r="20" fill={`url(#${lightGradientId})`} />
        <circle cx="20" cy="20" r="19.25" stroke="#A93600" strokeOpacity="0.42" strokeWidth="0.75" />
        <path d={ECODE_GLYPH_PATH} stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d={ECODE_CHEVRON_PATH} stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      <g data-ecode-mark-variant="dark">
        <circle cx="20" cy="20" r="20" fill={`url(#${darkGradientId})`} />
        <circle cx="20" cy="20" r="19.25" stroke="#FFD0A0" strokeOpacity="0.34" strokeWidth="0.75" />
        <path d={ECODE_GLYPH_PATH} stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d={ECODE_CHEVRON_PATH} stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

export default EcodeBootMark;
