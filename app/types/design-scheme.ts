export interface DesignScheme {
  palette: { [key: string]: string }; // Changed from string[] to object
  features: string[];
  font: string[];
}

export const defaultDesignScheme: DesignScheme = {
  palette: {
    primary: '#9E7FFF',
    secondary: '#38bdf8',
    accent: '#f472b6',
    background: '#171717',
    surface: '#262626',
    text: '#FFFFFF',
    textSecondary: '#A3A3A3',
    border: '#2F2F2F',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
  },
  features: ['rounded'],
  font: ['sans-serif'],
};

export const paletteRoles = [
  {
    key: 'primary',
    labelKey: 'designPalette.role.primary.label',
    descriptionKey: 'designPalette.role.primary.description',
  },
  {
    key: 'secondary',
    labelKey: 'designPalette.role.secondary.label',
    descriptionKey: 'designPalette.role.secondary.description',
  },
  {
    key: 'accent',
    labelKey: 'designPalette.role.accent.label',
    descriptionKey: 'designPalette.role.accent.description',
  },
  {
    key: 'background',
    labelKey: 'designPalette.role.background.label',
    descriptionKey: 'designPalette.role.background.description',
  },
  {
    key: 'surface',
    labelKey: 'designPalette.role.surface.label',
    descriptionKey: 'designPalette.role.surface.description',
  },
  {
    key: 'text',
    labelKey: 'designPalette.role.text.label',
    descriptionKey: 'designPalette.role.text.description',
  },
  {
    key: 'textSecondary',
    labelKey: 'designPalette.role.textSecondary.label',
    descriptionKey: 'designPalette.role.textSecondary.description',
  },
  {
    key: 'border',
    labelKey: 'designPalette.role.border.label',
    descriptionKey: 'designPalette.role.border.description',
  },
  {
    key: 'success',
    labelKey: 'designPalette.role.success.label',
    descriptionKey: 'designPalette.role.success.description',
  },
  {
    key: 'warning',
    labelKey: 'designPalette.role.warning.label',
    descriptionKey: 'designPalette.role.warning.description',
  },
  {
    key: 'error',
    labelKey: 'designPalette.role.error.label',
    descriptionKey: 'designPalette.role.error.description',
  },
] satisfies Array<{ key: string; labelKey: DesignPaletteKey; descriptionKey: DesignPaletteKey }>;

export const designFeatures = [
  { key: 'rounded', labelKey: 'designPalette.feature.rounded' },
  { key: 'border', labelKey: 'designPalette.feature.border' },
  { key: 'gradient', labelKey: 'designPalette.feature.gradient' },
  { key: 'shadow', labelKey: 'designPalette.feature.shadow' },
  { key: 'frosted-glass', labelKey: 'designPalette.feature.frostedGlass' },
] satisfies Array<{ key: string; labelKey: DesignPaletteKey }>;

export const designFonts = [
  { key: 'sans-serif', labelKey: 'designPalette.font.sansSerif', preview: 'Aa' },
  { key: 'serif', labelKey: 'designPalette.font.serif', preview: 'Aa' },
  { key: 'monospace', labelKey: 'designPalette.font.monospace', preview: 'Aa' },
  { key: 'cursive', labelKey: 'designPalette.font.cursive', preview: 'Aa' },
  { key: 'fantasy', labelKey: 'designPalette.font.fantasy', preview: 'Aa' },
] satisfies Array<{ key: string; labelKey: DesignPaletteKey; preview: string }>;
import type { DesignPaletteKey } from '~/lib/i18n/catalogs/design-palette';
