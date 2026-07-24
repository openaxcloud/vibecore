import type { SupportedLanguage } from '~/lib/i18n/language';

export type AppBuilderVisualLanguage = 'en' | 'fr';

export type AppBuilderVisualAsset = Readonly<{
  src: string;
  width: number;
  height: number;
  language: AppBuilderVisualLanguage;
}>;

export type AppBuilderVisualSet = Readonly<{
  hero: AppBuilderVisualAsset;
  booking: AppBuilderVisualAsset;
  schedule: AppBuilderVisualAsset;
  reminder: AppBuilderVisualAsset;
  idePreview: AppBuilderVisualAsset;
  ideIteration: AppBuilderVisualAsset;
}>;

function visualAsset(
  language: AppBuilderVisualLanguage,
  file: string,
  width: number,
  height: number,
): AppBuilderVisualAsset {
  return {
    src: `/assets/solutions/app-builder/${language}/${file}`,
    width,
    height,
    language,
  };
}

export const APP_BUILDER_VISUAL_ASSETS = {
  en: {
    hero: visualAsset('en', 'live-booking-app.png', 1440, 900),
    booking: visualAsset('en', 'mobile-booking.png', 900, 1050),
    schedule: visualAsset('en', 'team-schedule.png', 1440, 900),
    reminder: visualAsset('en', 'client-reminders.png', 1440, 900),
    idePreview: visualAsset('en', 'ide-agent-preview.png', 1440, 900),
    ideIteration: visualAsset('en', 'ide-agent-iteration.png', 1440, 900),
  },
  fr: {
    hero: visualAsset('fr', 'live-booking-app.png', 1440, 900),
    booking: visualAsset('fr', 'mobile-booking.png', 900, 1050),
    schedule: visualAsset('fr', 'team-schedule.png', 1440, 900),
    reminder: visualAsset('fr', 'client-reminders.png', 1440, 900),
    idePreview: visualAsset('fr', 'ide-agent-preview.png', 1440, 900),
    ideIteration: visualAsset('fr', 'ide-agent-iteration.png', 1440, 900),
  },
} as const satisfies Record<AppBuilderVisualLanguage, AppBuilderVisualSet>;

export function resolveAppBuilderVisualLanguage(language: SupportedLanguage): AppBuilderVisualLanguage {
  return language === 'fr' ? 'fr' : 'en';
}
