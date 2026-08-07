import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const importButtonsEn = {
  'importButtons.group.label': 'Import options',
  'importButtons.chat.trigger': 'Import chat',
  'importButtons.chat.selectLabel': 'Choose a JSON chat export to import',
  'importButtons.chat.defaultDescription': 'Imported chat',
  'importButtons.chat.loading': 'Importing chat…',
  'importButtons.chat.loadingNamed': 'Importing {fileName}…',
  'importButtons.chat.success': 'The chat was imported successfully.',
  'importButtons.chat.successNamed': '{fileName} was imported successfully.',
  'importButtons.chat.unavailable': 'Chat import is unavailable right now.',
  'importButtons.chat.invalidFormat':
    'This file is not a valid E-Code chat export. Choose a JSON export containing a messages array.',
  'importButtons.chat.parseFailed':
    'This JSON file could not be parsed. Check that it is a valid E-Code chat export, then try again.',
  'importButtons.chat.readFailed':
    'The selected file could not be read. Check its permissions, then choose the file again.',
  'importButtons.chat.importFailed': 'The chat could not be imported. Check the file, then try again.',
} as const;

export type ImportButtonsKey = keyof typeof importButtonsEn;
export type ImportButtonsCopy = Readonly<Record<ImportButtonsKey, string>>;
export type ImportButtonsErrorCode = 'importFailed' | 'invalidFormat' | 'parseFailed' | 'readFailed' | 'unavailable';

export const importButtonsFr: ImportButtonsCopy = {
  'importButtons.group.label': 'Options d’importation',
  'importButtons.chat.trigger': 'Importer une conversation',
  'importButtons.chat.selectLabel': 'Choisir un export JSON de conversation à importer',
  'importButtons.chat.defaultDescription': 'Conversation importée',
  'importButtons.chat.loading': 'Importation de la conversation…',
  'importButtons.chat.loadingNamed': 'Importation de {fileName}…',
  'importButtons.chat.success': 'La conversation a bien été importée.',
  'importButtons.chat.successNamed': 'Le fichier {fileName} a bien été importé.',
  'importButtons.chat.unavailable': 'L’importation de conversations est momentanément indisponible.',
  'importButtons.chat.invalidFormat':
    'Ce fichier n’est pas un export de conversation E-Code valide. Choisissez un export JSON contenant un tableau de messages.',
  'importButtons.chat.parseFailed':
    'Impossible d’analyser ce fichier JSON. Vérifiez qu’il s’agit d’un export de conversation E-Code valide, puis réessayez.',
  'importButtons.chat.readFailed':
    'Impossible de lire le fichier sélectionné. Vérifiez ses autorisations, puis choisissez-le de nouveau.',
  'importButtons.chat.importFailed': 'Impossible d’importer la conversation. Vérifiez le fichier, puis réessayez.',
};

export function getImportButtonsCopy(language?: string | null): ImportButtonsCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? importButtonsFr : importButtonsEn;
}

export function formatImportButtonsCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>> = {},
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

/** Never expose arbitrary file-reader, JSON parser, browser, or import-handler exceptions. */
export function getImportButtonsSafeError(
  code: ImportButtonsErrorCode,
  language?: string | null,
  _error?: unknown,
): string {
  return getImportButtonsCopy(language)[`importButtons.chat.${code}`];
}
