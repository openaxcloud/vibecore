import type { SupportedLanguage } from '~/lib/i18n/language';
import type { Theme } from '~/lib/stores/theme';

export type AppBuilderVisualLanguage = 'en' | 'fr';
export type AppBuilderVisualTheme = Theme;

export type AppBuilderVisualSource = Readonly<{
  src: string;
  width: number;
  height: number;
}>;

export type AppBuilderVisualAsset = Readonly<{
  src: string;
  srcSet: string;
  sources: readonly [AppBuilderVisualSource, AppBuilderVisualSource];
  width: number;
  height: number;
  language: AppBuilderVisualLanguage;
  theme: AppBuilderVisualTheme;
}>;

export type AppBuilderVisualSet = Readonly<{
  hero: AppBuilderVisualAsset;
  booking: AppBuilderVisualAsset;
  schedule: AppBuilderVisualAsset;
  reminder: AppBuilderVisualAsset;
  idePreview: AppBuilderVisualAsset;
  ideIteration: AppBuilderVisualAsset;
}>;

export const APP_BUILDER_VISUAL_THEMES = ['light', 'dark'] as const satisfies readonly AppBuilderVisualTheme[];

function responsiveSource(
  language: AppBuilderVisualLanguage,
  theme: AppBuilderVisualTheme,
  file: string,
  width: number,
  height: number,
): AppBuilderVisualSource {
  return {
    src: `/assets/solutions/app-builder/${language}/${theme}/${file}-${width}.webp`,
    width,
    height,
  };
}

function visualAsset(
  language: AppBuilderVisualLanguage,
  theme: AppBuilderVisualTheme,
  file: string,
  width: number,
  height: number,
  responsiveWidth = 720,
): AppBuilderVisualAsset {
  const responsiveHeight = Math.round((height * responsiveWidth) / width);

  const sources = [
    responsiveSource(language, theme, file, responsiveWidth, responsiveHeight),
    responsiveSource(language, theme, file, width, height),
  ] as const;

  return {
    src: sources[1].src,
    srcSet: sources.map((source) => `${source.src} ${source.width}w`).join(', '),
    sources,
    width,
    height,
    language,
    theme,
  };
}

function visualSet(language: AppBuilderVisualLanguage, theme: AppBuilderVisualTheme): AppBuilderVisualSet {
  return {
    hero: visualAsset(language, theme, 'live-booking-app', 1440, 900),
    booking: visualAsset(language, theme, 'mobile-booking', 900, 1050),
    schedule: visualAsset(language, theme, 'team-schedule', 1440, 900),
    reminder: visualAsset(language, theme, 'client-reminders', 1440, 900),
    idePreview: visualAsset(language, theme, 'ide-agent-preview', 1440, 900),
    ideIteration: visualAsset(language, theme, 'ide-agent-iteration', 1440, 900),
  };
}

export const APP_BUILDER_VISUAL_ASSETS = {
  en: {
    light: visualSet('en', 'light'),
    dark: visualSet('en', 'dark'),
  },
  fr: {
    light: visualSet('fr', 'light'),
    dark: visualSet('fr', 'dark'),
  },
} as const satisfies Record<AppBuilderVisualLanguage, Record<AppBuilderVisualTheme, AppBuilderVisualSet>>;

export function resolveAppBuilderVisualLanguage(language: SupportedLanguage): AppBuilderVisualLanguage {
  return language === 'fr' ? 'fr' : 'en';
}

export function getAppBuilderVisuals(language: SupportedLanguage, theme: AppBuilderVisualTheme) {
  return APP_BUILDER_VISUAL_ASSETS[resolveAppBuilderVisualLanguage(language)][theme];
}

/**
 * Enterprise is maintained by a separate stream. Its historical solution page
 * deliberately keeps the two App Builder PNG references it had on origin/main;
 * these assets must not enter the new themed capture contract.
 */
export type LegacyAppBuilderVisualAsset = Readonly<{
  src: string;
  width: number;
  height: number;
  language: AppBuilderVisualLanguage;
}>;

export type LegacyAppBuilderVisualSet = Readonly<{
  idePreview: LegacyAppBuilderVisualAsset;
  ideIteration: LegacyAppBuilderVisualAsset;
}>;

function legacyVisualAsset(language: AppBuilderVisualLanguage, file: string): LegacyAppBuilderVisualAsset {
  return {
    src: `/assets/solutions/app-builder/${language}/${file}.png`,
    width: 1440,
    height: 900,
    language,
  };
}

export const APP_BUILDER_LEGACY_VISUAL_ASSETS = {
  en: {
    idePreview: legacyVisualAsset('en', 'ide-agent-preview'),
    ideIteration: legacyVisualAsset('en', 'ide-agent-iteration'),
  },
  fr: {
    idePreview: legacyVisualAsset('fr', 'ide-agent-preview'),
    ideIteration: legacyVisualAsset('fr', 'ide-agent-iteration'),
  },
} as const satisfies Record<AppBuilderVisualLanguage, LegacyAppBuilderVisualSet>;
