import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const headerActionButtonsEn = {
  'headerActionButtons.help.tooltip': 'Help and debug tools',
  'headerActionButtons.help.aria': 'Help and debug tools',
  'headerActionButtons.help.label': 'Help',
  'headerActionButtons.reportBug': 'Report a bug',
  'headerActionButtons.downloadDebugLog': 'Download debug log',
  'headerActionButtons.downloadingDebugLog': 'Downloading debug log…',
  'headerActionButtons.debugLogDownloaded': 'Debug log downloaded.',
  'headerActionButtons.debugLogDownloadFailed': 'The debug log could not be downloaded. Try again.',
} as const;

export type HeaderActionButtonsKey = keyof typeof headerActionButtonsEn;
export type HeaderActionButtonsCopy = Readonly<Record<HeaderActionButtonsKey, string>>;

export const headerActionButtonsFr: HeaderActionButtonsCopy = {
  'headerActionButtons.help.tooltip': 'Aide et outils de débogage',
  'headerActionButtons.help.aria': 'Aide et outils de débogage',
  'headerActionButtons.help.label': 'Aide',
  'headerActionButtons.reportBug': 'Signaler un bug',
  'headerActionButtons.downloadDebugLog': 'Télécharger le journal de débogage',
  'headerActionButtons.downloadingDebugLog': 'Téléchargement du journal de débogage…',
  'headerActionButtons.debugLogDownloaded': 'Journal de débogage téléchargé.',
  'headerActionButtons.debugLogDownloadFailed': 'Impossible de télécharger le journal de débogage. Réessayez.',
};

export function getHeaderActionButtonsCopy(language?: string | null): HeaderActionButtonsCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? headerActionButtonsFr : headerActionButtonsEn;
}
