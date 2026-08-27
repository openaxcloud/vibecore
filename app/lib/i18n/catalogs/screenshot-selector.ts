import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const screenshotSelectorEn = {
  'screenshotSelector.aria': 'Select an area to capture',
  'screenshotSelector.instructions': 'Drag across the area to capture. Press Escape to cancel.',
  'screenshotSelector.capturing': 'Capturing the selected area…',
  'screenshotSelector.toast.streamFailed':
    'Screen capture could not start. Check the browser permission and try again.',
  'screenshotSelector.toast.captured': 'Screenshot captured and added to the chat.',
  'screenshotSelector.toast.addFailed': 'The screenshot could not be added to the chat.',
  'screenshotSelector.toast.captureFailed': 'The screenshot could not be captured. Try again.',
} as const;

export type ScreenshotSelectorKey = keyof typeof screenshotSelectorEn;
export type ScreenshotSelectorCopy = Readonly<Record<ScreenshotSelectorKey, string>>;

export const screenshotSelectorFr: ScreenshotSelectorCopy = {
  'screenshotSelector.aria': 'Sélectionner une zone à capturer',
  'screenshotSelector.instructions':
    'Faites glisser le pointeur sur la zone à capturer. Appuyez sur Échap pour annuler.',
  'screenshotSelector.capturing': 'Capture de la zone sélectionnée…',
  'screenshotSelector.toast.streamFailed':
    'Impossible de démarrer la capture d’écran. Vérifiez l’autorisation du navigateur, puis réessayez.',
  'screenshotSelector.toast.captured': 'Capture d’écran ajoutée à la conversation.',
  'screenshotSelector.toast.addFailed': 'Impossible d’ajouter la capture d’écran à la conversation.',
  'screenshotSelector.toast.captureFailed': 'Impossible d’effectuer la capture d’écran. Réessayez.',
};

export function getScreenshotSelectorCopy(language?: string | null): ScreenshotSelectorCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? screenshotSelectorFr : screenshotSelectorEn;
}
