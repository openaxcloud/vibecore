import { resolveMarketingLanguage } from './marketing';

export const databaseStudioEn = {
  'databaseStudio.copied': 'Copied',
  'databaseStudio.copy': 'Copy',
  'databaseStudio.showFullValue': 'Show full value',
  'databaseStudio.fullValue': 'Full value',
  'databaseStudio.connection': 'Connection',
  'databaseStudio.refreshSchema': 'Refresh schema',
  'databaseStudio.tables': 'Tables',
  'databaseStudio.connectionFailed': 'Connection failed',
  'databaseStudio.safeConnectionError': 'Could not load the database connection.',
  'databaseStudio.loadingSchema': 'Loading schema…',
  'databaseStudio.noTables': 'No tables',
  'databaseStudio.noTablesDescription': 'No tables were found for this connection.',
  'databaseStudio.sqlQuery': 'SQL query',
  'databaseStudio.running': 'Running…',
  'databaseStudio.run': 'Run',
  'databaseStudio.shortcut': '⌘/Ctrl + Enter',
  'databaseStudio.productionTitle':
    'The active connection looks like a production database. Destructive statements require confirmation before they run.',
  'databaseStudio.production': 'Production',
  'databaseStudio.exportCsv': 'Export CSV',
  'databaseStudio.insertRow': '+ Insert row',
  'databaseStudio.editing': 'Editing — click a cell',
  'databaseStudio.edit': 'Edit',
  'databaseStudio.queryFailed': 'Query failed',
  'databaseStudio.safeQueryError': 'The query could not be completed.',
  'databaseStudio.runningQuery': 'Running query…',
  'databaseStudio.noRows': 'No rows returned',
  'databaseStudio.noRowsDescription': 'The query ran successfully but returned no rows.',
  'databaseStudio.noResults': 'No results yet',
  'databaseStudio.noResultsDescription': 'Run a query or select a table on the left to see results.',
  'databaseStudio.destructive.title': 'Run destructive statement?',
  'databaseStudio.destructive.confirm': 'Run statement',
  'databaseStudio.destructive.description': 'This statement can modify or delete data. Review it before running:',
  'databaseStudio.destructive.productionDescription':
    'This statement can modify or delete data in the production database. Review it before running:',
  'databaseStudio.destructive.connection': 'Connection: {connection}',
  'databaseStudio.history.title': 'History',
  'databaseStudio.history.count': '({count})',
  'databaseStudio.history.empty': 'No queries yet — successful runs will appear here.',
  'databaseStudio.history.remove': 'Remove from history: {statement}',
  'databaseStudio.history.clear': 'Clear all',
  'databaseSettings.active': 'Active',
  'databaseSettings.connectionString': 'Connection string',
  'databaseSettings.hide': 'Hide',
  'databaseSettings.reveal': 'Reveal',
  'databaseSettings.hideConnectionString': 'Hide connection string',
  'databaseSettings.revealConnectionString': 'Reveal connection string',
  'databaseSettings.copy': 'Copy',
  'databaseSettings.copied': 'Copied',
  'databaseSettings.copyConnectionString': 'Copy connection string',
  'databaseSettings.connectionDescription': 'The address and password your app uses to connect to this database.',
  'databaseSettings.storage': 'Storage',
  'databaseSettings.storageOf': '{used} of {quota}',
  'databaseSettings.storagePercent': '{percent}% used',
  'databaseSettings.storageProgress': 'Storage used: {percent}%',
  'databaseSettings.storageUnavailable': 'Storage usage appears once the database reports it.',
  'databaseSettings.advanced': 'Advanced',
  'databaseSettings.connectionDetails_one': 'Connection details — {count} URL',
  'databaseSettings.connectionDetails_other': 'Connection details — {count} URLs',
  'databaseSettings.remove': 'Remove database',
  'databaseWorkbench.allDatabases': 'All databases',
  'databaseWorkbench.refresh': 'Refresh',
  'databaseWorkbench.loading': 'Loading databases…',
  'databaseWorkbench.loadFailed': 'Could not load the databases.',
  'databaseWorkbench.retry': 'Try again',
  'databaseWorkbench.noDatabase': 'No database yet',
  'databaseWorkbench.noDatabaseDescription':
    'Provision a managed Postgres database for this project. The schema browser, SQL editor, and backups will use it.',
  'databaseWorkbench.creating': 'Creating database…',
  'databaseWorkbench.create': 'Create database',
  'databaseWorkbench.provisionFailed': 'Could not create the database. Try again.',
  'databaseWorkbench.status.connected': 'Connected',
  'databaseWorkbench.status.provisioning': 'Provisioning',
  'databaseWorkbench.status.unavailable': 'Unavailable',
  'databaseWorkbench.status.unknown': 'Status unavailable',
  'databaseWorkbench.overview': 'Overview',
  'databaseWorkbench.myData': 'My data',
  'databaseWorkbench.settings': 'Settings',
  'databaseWorkbench.views': 'Database views',
  'databaseWorkbench.tables': 'Tables',
  'databaseWorkbench.loadingSchema': 'Loading schema…',
  'databaseWorkbench.noTables': 'No tables yet.',
  'databaseWorkbench.rows_one': '{count} row',
  'databaseWorkbench.rows_other': '{count} rows',
} as const;

export type DatabaseStudioKey = keyof typeof databaseStudioEn;
export type DatabaseStudioCopy = Readonly<Record<DatabaseStudioKey, string>>;

export const databaseStudioFr: DatabaseStudioCopy = {
  'databaseStudio.copied': 'Copié',
  'databaseStudio.copy': 'Copier',
  'databaseStudio.showFullValue': 'Afficher la valeur complète',
  'databaseStudio.fullValue': 'Valeur complète',
  'databaseStudio.connection': 'Connexion',
  'databaseStudio.refreshSchema': 'Actualiser le schéma',
  'databaseStudio.tables': 'Tables',
  'databaseStudio.connectionFailed': 'Échec de la connexion',
  'databaseStudio.safeConnectionError': 'Impossible de charger la connexion à la base de données.',
  'databaseStudio.loadingSchema': 'Chargement du schéma…',
  'databaseStudio.noTables': 'Aucune table',
  'databaseStudio.noTablesDescription': 'Aucune table n’a été trouvée pour cette connexion.',
  'databaseStudio.sqlQuery': 'Requête SQL',
  'databaseStudio.running': 'Exécution…',
  'databaseStudio.run': 'Exécuter',
  'databaseStudio.shortcut': '⌘/Ctrl + Entrée',
  'databaseStudio.productionTitle':
    'La connexion active semble pointer vers une base de données de production. Les instructions destructrices nécessitent une confirmation.',
  'databaseStudio.production': 'Production',
  'databaseStudio.exportCsv': 'Exporter en CSV',
  'databaseStudio.insertRow': '+ Insérer une ligne',
  'databaseStudio.editing': 'Modification — cliquez sur une cellule',
  'databaseStudio.edit': 'Modifier',
  'databaseStudio.queryFailed': 'Échec de la requête',
  'databaseStudio.safeQueryError': 'Impossible d’exécuter la requête.',
  'databaseStudio.runningQuery': 'Exécution de la requête…',
  'databaseStudio.noRows': 'Aucune ligne renvoyée',
  'databaseStudio.noRowsDescription': 'La requête a réussi, mais n’a renvoyé aucune ligne.',
  'databaseStudio.noResults': 'Aucun résultat pour le moment',
  'databaseStudio.noResultsDescription':
    'Exécutez une requête ou sélectionnez une table à gauche pour afficher les résultats.',
  'databaseStudio.destructive.title': 'Exécuter l’instruction destructive ?',
  'databaseStudio.destructive.confirm': 'Exécuter l’instruction',
  'databaseStudio.destructive.description':
    'Cette instruction peut modifier ou supprimer des données. Vérifiez-la avant de l’exécuter :',
  'databaseStudio.destructive.productionDescription':
    'Cette instruction peut modifier ou supprimer des données dans la base de production. Vérifiez-la avant de l’exécuter :',
  'databaseStudio.destructive.connection': 'Connexion : {connection}',
  'databaseStudio.history.title': 'Historique',
  'databaseStudio.history.count': '({count})',
  'databaseStudio.history.empty': 'Aucune requête pour le moment — les exécutions réussies apparaîtront ici.',
  'databaseStudio.history.remove': 'Retirer de l’historique : {statement}',
  'databaseStudio.history.clear': 'Tout effacer',
  'databaseSettings.active': 'Active',
  'databaseSettings.connectionString': 'Chaîne de connexion',
  'databaseSettings.hide': 'Masquer',
  'databaseSettings.reveal': 'Afficher',
  'databaseSettings.hideConnectionString': 'Masquer la chaîne de connexion',
  'databaseSettings.revealConnectionString': 'Afficher la chaîne de connexion',
  'databaseSettings.copy': 'Copier',
  'databaseSettings.copied': 'Copié',
  'databaseSettings.copyConnectionString': 'Copier la chaîne de connexion',
  'databaseSettings.connectionDescription':
    'L’adresse et le mot de passe utilisés par votre application pour se connecter à cette base de données.',
  'databaseSettings.storage': 'Stockage',
  'databaseSettings.storageOf': '{used} sur {quota}',
  'databaseSettings.storagePercent': '{percent} % utilisés',
  'databaseSettings.storageProgress': 'Stockage utilisé : {percent} %',
  'databaseSettings.storageUnavailable':
    'L’utilisation du stockage apparaîtra dès que la base de données la transmettra.',
  'databaseSettings.advanced': 'Paramètres avancés',
  'databaseSettings.connectionDetails_one': 'Détails de connexion — {count} URL',
  'databaseSettings.connectionDetails_other': 'Détails de connexion — {count} URL',
  'databaseSettings.remove': 'Supprimer la base de données',
  'databaseWorkbench.allDatabases': 'Toutes les bases de données',
  'databaseWorkbench.refresh': 'Actualiser',
  'databaseWorkbench.loading': 'Chargement des bases de données…',
  'databaseWorkbench.loadFailed': 'Impossible de charger les bases de données.',
  'databaseWorkbench.retry': 'Réessayer',
  'databaseWorkbench.noDatabase': 'Aucune base de données pour le moment',
  'databaseWorkbench.noDatabaseDescription':
    'Créez une base de données Postgres gérée pour ce projet. L’explorateur de schéma, l’éditeur SQL et les sauvegardes l’utiliseront.',
  'databaseWorkbench.creating': 'Création de la base de données…',
  'databaseWorkbench.create': 'Créer une base de données',
  'databaseWorkbench.provisionFailed': 'Impossible de créer la base de données. Réessayez.',
  'databaseWorkbench.status.connected': 'Connectée',
  'databaseWorkbench.status.provisioning': 'Création en cours',
  'databaseWorkbench.status.unavailable': 'Indisponible',
  'databaseWorkbench.status.unknown': 'État indisponible',
  'databaseWorkbench.overview': 'Vue d’ensemble',
  'databaseWorkbench.myData': 'Mes données',
  'databaseWorkbench.settings': 'Paramètres',
  'databaseWorkbench.views': 'Vues de la base de données',
  'databaseWorkbench.tables': 'Tables',
  'databaseWorkbench.loadingSchema': 'Chargement du schéma…',
  'databaseWorkbench.noTables': 'Aucune table pour le moment.',
  'databaseWorkbench.rows_one': '{count} ligne',
  'databaseWorkbench.rows_other': '{count} lignes',
};

export function getDatabaseStudioCopy(language?: string | null): DatabaseStudioCopy {
  return resolveMarketingLanguage(language) === 'fr' ? databaseStudioFr : databaseStudioEn;
}

export function formatDatabaseStudioCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatDatabaseStudioNumber(value: number, language?: string | null): string {
  return new Intl.NumberFormat(resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US').format(value);
}

export function formatDatabaseStudioPlural(
  language: string | null | undefined,
  count: number,
  templates: Readonly<{ one: string; other: string }>,
): string {
  const resolvedLanguage = resolveMarketingLanguage(language);
  const locale = resolvedLanguage === 'fr' ? 'fr-FR' : 'en-US';
  const template = new Intl.PluralRules(locale).select(count) === 'one' ? templates.one : templates.other;

  return formatDatabaseStudioCopy(template, { count: new Intl.NumberFormat(locale).format(count) });
}

export function formatDatabaseSettingsBytes(bytes: number | undefined, language?: string | null): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    return null;
  }

  const resolvedLanguage = resolveMarketingLanguage(language);
  const megabytes = bytes / (1024 * 1024);
  const useMegabytes = megabytes < 1024;
  const value = useMegabytes ? megabytes : megabytes / 1024;
  const fractionDigits = useMegabytes && value >= 10 ? 0 : 2;
  const roundedValue = Number(value.toFixed(fractionDigits));

  if (resolvedLanguage === 'fr') {
    const formatted = new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(roundedValue);

    return `${formatted} ${useMegabytes ? 'Mo' : 'Go'}`;
  }

  const formatted = roundedValue.toFixed(fractionDigits);

  return `${formatted}${useMegabytes ? 'MB' : 'GB'}`;
}
