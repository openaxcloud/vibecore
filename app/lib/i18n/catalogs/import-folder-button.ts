import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const importFolderButtonEn = {
  'importFolderButton.trigger': 'Import folder',
  'importFolderButton.selectLabel': 'Choose a folder to import',
  'importFolderButton.unavailable': 'Folder import is unavailable right now.',
  'importFolderButton.loading': 'Importing folder…',
  'importFolderButton.loadingNamed': 'Importing {folderName}…',
  'importFolderButton.noValidFiles': 'No importable files were found in the selected folder.',
  'importFolderButton.tooManyFiles':
    'This folder contains {count} files. E-Code is not optimized for projects of this size. Select a folder containing fewer than {max} files.',
  'importFolderButton.noTextFiles': 'The selected folder does not contain any importable text files.',
  'importFolderButton.binarySkipped_one': '{count} binary file was skipped.',
  'importFolderButton.binarySkipped_other': '{count} binary files were skipped.',
  'importFolderButton.success': 'The folder was imported successfully.',
  'importFolderButton.successNamed': 'The {folderName} folder was imported successfully.',
  'importFolderButton.failed': 'The folder could not be imported. Check access to its files, then try again.',
  'importFolderButton.folderFallback': 'selected folder',
  'importFolderButton.chat.imported': 'The contents of the “{folderName}” folder were imported.',
  'importFolderButton.chat.binarySkipped_one': '{count} binary file was skipped:',
  'importFolderButton.chat.binarySkipped_other': '{count} binary files were skipped:',
  'importFolderButton.chat.unreadableSkipped_one': '{count} unreadable file was skipped:',
  'importFolderButton.chat.unreadableSkipped_other': '{count} unreadable files were skipped:',
  'importFolderButton.chat.artifactTitle': 'Imported files',
  'importFolderButton.chat.userPrompt': 'Import the “{folderName}” folder',
} as const;

export type ImportFolderButtonKey = keyof typeof importFolderButtonEn;
export type ImportFolderButtonCopy = Readonly<Record<ImportFolderButtonKey, string>>;

export const importFolderButtonFr: ImportFolderButtonCopy = {
  'importFolderButton.trigger': 'Importer un dossier',
  'importFolderButton.selectLabel': 'Choisir un dossier à importer',
  'importFolderButton.unavailable': 'L’importation de dossiers est momentanément indisponible.',
  'importFolderButton.loading': 'Importation du dossier…',
  'importFolderButton.loadingNamed': 'Importation de {folderName}…',
  'importFolderButton.noValidFiles': 'Aucun fichier importable n’a été trouvé dans le dossier sélectionné.',
  'importFolderButton.tooManyFiles':
    'Ce dossier contient {count} fichiers. E-Code n’est pas optimisé pour les projets de cette taille. Sélectionnez un dossier contenant moins de {max} fichiers.',
  'importFolderButton.noTextFiles': 'Le dossier sélectionné ne contient aucun fichier texte importable.',
  'importFolderButton.binarySkipped_one': '{count} fichier binaire a été ignoré.',
  'importFolderButton.binarySkipped_other': '{count} fichiers binaires ont été ignorés.',
  'importFolderButton.success': 'Le dossier a bien été importé.',
  'importFolderButton.successNamed': 'Le dossier {folderName} a bien été importé.',
  'importFolderButton.failed': 'Impossible d’importer le dossier. Vérifiez l’accès à ses fichiers, puis réessayez.',
  'importFolderButton.folderFallback': 'dossier sélectionné',
  'importFolderButton.chat.imported': 'Le contenu du dossier « {folderName} » a été importé.',
  'importFolderButton.chat.binarySkipped_one': '{count} fichier binaire a été ignoré :',
  'importFolderButton.chat.binarySkipped_other': '{count} fichiers binaires ont été ignorés :',
  'importFolderButton.chat.unreadableSkipped_one': '{count} fichier illisible a été ignoré :',
  'importFolderButton.chat.unreadableSkipped_other': '{count} fichiers illisibles ont été ignorés :',
  'importFolderButton.chat.artifactTitle': 'Fichiers importés',
  'importFolderButton.chat.userPrompt': 'Importer le dossier « {folderName} »',
};

export function getImportFolderButtonCopy(language?: string | null): ImportFolderButtonCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? importFolderButtonFr : importFolderButtonEn;
}

export function formatImportFolderButtonCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>> = {},
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatImportFolderButtonNumber(value: number | bigint, language?: string | null): string {
  const safeValue = typeof value === 'number' && !Number.isFinite(value) ? 0 : value;
  const locale = normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';

  return new Intl.NumberFormat(locale).format(safeValue);
}

export function formatImportFolderButtonPlural(
  language: string | null | undefined,
  count: number,
  templates: Readonly<{ one: string; other: string }>,
): string {
  const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  const locale = normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
  const template = new Intl.PluralRules(locale).select(safeCount) === 'one' ? templates.one : templates.other;

  return formatImportFolderButtonCopy(template, {
    count: new Intl.NumberFormat(locale).format(safeCount),
  });
}

/** Never expose arbitrary browser, file-reader, API, or import-handler exceptions. */
export function getImportFolderButtonSafeError(language?: string | null, _error?: unknown): string {
  return getImportFolderButtonCopy(language)['importFolderButton.failed'];
}
