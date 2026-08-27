import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const importSpreadsheetEn = {
  'importSpreadsheet.meta.title': 'Import a spreadsheet - E-Code',
  'importSpreadsheet.meta.description':
    'Turn CSV or TSV data into a sortable application that you can open and extend in the E-Code IDE.',
  'importSpreadsheet.page.title': 'Import a spreadsheet',
  'importSpreadsheet.page.description':
    'Paste CSV or TSV data to generate a real, sortable data application that you can open in the IDE and extend with the agent.',
  'importSpreadsheet.form.projectName': 'Project name',
  'importSpreadsheet.form.projectPlaceholder': 'Spreadsheet application',
  'importSpreadsheet.form.data': 'CSV or TSV data',
  'importSpreadsheet.form.dataPlaceholder':
    'name,role,city\nAda Lovelace,Engineer,London\nGrace Hopper,Admiral,New York',
  'importSpreadsheet.form.help':
    'The first row becomes the column headings. The comma or tab delimiter is detected automatically.',
  'importSpreadsheet.form.generating': 'Generating the application…',
  'importSpreadsheet.form.create': 'Create the data application',
  'importSpreadsheet.form.progress': 'Generating the data application',
  'importSpreadsheet.error.dataRequired': 'Paste CSV or TSV data before continuing.',
  'importSpreadsheet.error.malformed':
    'Add a heading row and at least one data row, then check the delimiter and try again.',
  'importSpreadsheet.error.tooLarge': 'This spreadsheet exceeds the import limit of {count} cells.',
  'importSpreadsheet.error.createFailed': 'The project could not be created from this spreadsheet. Try again.',
  'importSpreadsheet.generated.defaultName': 'Spreadsheet application',
  'importSpreadsheet.generated.column': 'Column {count}',
  'importSpreadsheet.generated.columns_one': '{count} column',
  'importSpreadsheet.generated.columns_other': '{count} columns',
  'importSpreadsheet.generated.rows_one': '{count} row',
  'importSpreadsheet.generated.rows_other': '{count} rows',
  'importSpreadsheet.generated.meta': '{columns} · {rows}',
  'importSpreadsheet.generated.filterPlaceholder': 'Filter rows…',
  'importSpreadsheet.generated.filterAria': 'Filter rows',
  'importSpreadsheet.generated.count_one': '{visible} of {total} row',
  'importSpreadsheet.generated.count_other': '{visible} of {total} rows',
  'importSpreadsheet.generated.readme':
    'A sortable data table generated from an imported spreadsheet ({columns} × {rows}).',
} as const;

export type ImportSpreadsheetKey = keyof typeof importSpreadsheetEn;
export type ImportSpreadsheetCopy = Readonly<Record<ImportSpreadsheetKey, string>>;

export const importSpreadsheetFr: ImportSpreadsheetCopy = {
  'importSpreadsheet.meta.title': 'Importer une feuille de calcul - E-Code',
  'importSpreadsheet.meta.description':
    'Transformez des données CSV ou TSV en application triable à ouvrir et à enrichir dans l’IDE E-Code.',
  'importSpreadsheet.page.title': 'Importer une feuille de calcul',
  'importSpreadsheet.page.description':
    'Collez des données CSV ou TSV pour générer une véritable application de données triable, à ouvrir dans l’IDE et à enrichir avec l’agent.',
  'importSpreadsheet.form.projectName': 'Nom du projet',
  'importSpreadsheet.form.projectPlaceholder': 'Application de données',
  'importSpreadsheet.form.data': 'Données CSV ou TSV',
  'importSpreadsheet.form.dataPlaceholder':
    'nom,rôle,ville\nAda Lovelace,Ingénieure,Londres\nGrace Hopper,Amirale,New York',
  'importSpreadsheet.form.help':
    'La première ligne devient l’en-tête des colonnes. Le séparateur, virgule ou tabulation, est détecté automatiquement.',
  'importSpreadsheet.form.generating': 'Génération de l’application…',
  'importSpreadsheet.form.create': 'Créer l’application de données',
  'importSpreadsheet.form.progress': 'Génération de l’application de données',
  'importSpreadsheet.error.dataRequired': 'Collez des données CSV ou TSV avant de continuer.',
  'importSpreadsheet.error.malformed':
    'Ajoutez une ligne d’en-tête et au moins une ligne de données, puis vérifiez le séparateur et réessayez.',
  'importSpreadsheet.error.tooLarge': 'Cette feuille dépasse la limite d’importation de {count} cellules.',
  'importSpreadsheet.error.createFailed':
    'Impossible de créer le projet à partir de cette feuille de calcul. Réessayez.',
  'importSpreadsheet.generated.defaultName': 'Application de données',
  'importSpreadsheet.generated.column': 'Colonne {count}',
  'importSpreadsheet.generated.columns_one': '{count} colonne',
  'importSpreadsheet.generated.columns_other': '{count} colonnes',
  'importSpreadsheet.generated.rows_one': '{count} ligne',
  'importSpreadsheet.generated.rows_other': '{count} lignes',
  'importSpreadsheet.generated.meta': '{columns} · {rows}',
  'importSpreadsheet.generated.filterPlaceholder': 'Filtrer les lignes…',
  'importSpreadsheet.generated.filterAria': 'Filtrer les lignes',
  'importSpreadsheet.generated.count_one': '{visible} ligne sur {total}',
  'importSpreadsheet.generated.count_other': '{visible} lignes sur {total}',
  'importSpreadsheet.generated.readme':
    'Tableau de données triable généré depuis une feuille de calcul importée ({columns} × {rows}).',
};

export function getImportSpreadsheetCopy(language?: string | null): ImportSpreadsheetCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? importSpreadsheetFr : importSpreadsheetEn;
}

export function formatImportSpreadsheetCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatImportSpreadsheetPlural(
  language: string | null | undefined,
  count: number,
  templates: Readonly<{ one: string; other: string }>,
): string {
  const locale = normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
  const template = new Intl.PluralRules(locale).select(count) === 'one' ? templates.one : templates.other;

  return formatImportSpreadsheetCopy(template, { count: new Intl.NumberFormat(locale).format(count) });
}
