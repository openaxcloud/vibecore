/*
 * @vibecore/ecode-theme — framework-agnostic theme fragment.
 *
 * Mirrors ~/dev/e-code/tailwind.config.ts theme.extend so any Tailwind- or
 * UnoCSS-based surface can wire the same fontFamily / colors / radius / spacing
 * to the CSS-variable tokens in src/tokens.css. The colors point at the same
 * `hsl(var(--token))` / `var(--token)` so light/dark switch with the .dark class.
 *
 * Tailwind:  theme: { extend: ecodeThemeExtend }
 * UnoCSS:    presetMini/presetWind theme can spread `ecodeThemeExtend` fields.
 */

export const ecodeFontFamily = {
  sans: [
    "'IBM Plex Sans'",
    '-apple-system',
    'BlinkMacSystemFont',
    '"Segoe UI"',
    'Roboto',
    'Oxygen',
    'Ubuntu',
    'Cantarell',
    '"Fira Sans"',
    '"Droid Sans"',
    '"Helvetica Neue"',
    'sans-serif',
  ],
  mono: [
    "'IBM Plex Mono'",
    '"SF Mono"',
    'Monaco',
    'Inconsolata',
    '"Fira Mono"',
    '"Droid Sans Mono"',
    '"Source Code Pro"',
    'monospace',
  ],
} as const;

export const ecodeColors = {
  'ecode-orange': {
    DEFAULT: 'var(--ecode-orange)',
    hover: 'var(--ecode-accent-hover)',
    light: 'var(--ecode-orange-light)',
    tint: 'var(--ecode-orange-tint)',
  },
  'ecode-yellow': 'var(--ecode-yellow)',
  'ecode-accent': {
    DEFAULT: 'var(--ecode-accent)',
    hover: 'var(--ecode-accent-hover)',
  },
  'ecode-secondary-accent': 'var(--ecode-secondary-accent)',
  status: {
    critical: 'hsl(var(--ecode-danger))',
    success: 'hsl(var(--ecode-green))',
    warning: 'hsl(var(--ecode-warning))',
    info: 'hsl(var(--ecode-info))',
  },
  background: 'hsl(var(--background))',
  foreground: 'hsl(var(--foreground))',
  card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
  popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
  primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
  secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
  muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
  accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
  destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
  border: 'hsl(var(--border))',
  input: 'hsl(var(--input))',
  ring: 'hsl(var(--ring))',
} as const;

export const ecodeBorderRadius = {
  lg: 'var(--ecode-radius-lg)',
  md: 'var(--ecode-radius-md)',
  sm: 'var(--ecode-radius-sm)',
  'ecode-sm': '4px',
  'ecode-md': '8px',
  'ecode-lg': '12px',
} as const;

export const ecodeSpacing = {
  'ecode-1': '4px',
  'ecode-2': '8px',
  'ecode-3': '12px',
  'ecode-4': '16px',
  'ecode-5': '20px',
  'ecode-6': '24px',
  'ecode-8': '32px',
  'ecode-10': '40px',
  'ecode-12': '48px',
} as const;

export const ecodeScreens = {
  xs: '480px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

export const ecodeThemeExtend = {
  fontFamily: ecodeFontFamily,
  colors: ecodeColors,
  borderRadius: ecodeBorderRadius,
  spacing: ecodeSpacing,
} as const;

export default ecodeThemeExtend;
