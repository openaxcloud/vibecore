import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export const databaseRestoreEn = {
  'databaseRestore.metaTitle': 'Database restore - E-Code',
  'databaseRestore.errors.projectNotFound': 'Project not found.',
  'databaseRestore.errors.projectUnavailable': 'The project could not be loaded.',
  'databaseRestore.errors.panelUnavailable': 'The database restore panel is unavailable.',
  'databaseRestore.errors.requestFailed': 'The database request could not be completed.',
  'databaseRestore.errors.invalidAction': 'Choose a valid database action.',
  'databaseRestore.errors.targetRequired': 'Choose a recovery point or a target time.',
  'databaseRestore.errors.invalidTarget': 'Choose a valid target time.',
  'databaseRestore.errors.restoreFailed': 'This restore could not be completed.',
  'databaseRestore.title': 'Point-in-time restore',
  'databaseRestore.description':
    "Roll this project's managed database back to an exact moment within your plan's retention window.",
  'databaseRestore.success.restore': 'Restore requested — track its progress in the history below.',
  'databaseRestore.success.snapshot': 'Snapshot requested — it will appear among the recovery points when ready.',
  'databaseRestore.success.provision': 'Database provisioning requested.',
  'databaseRestore.notAvailable.title': 'Point-in-time restore is not available',
  'databaseRestore.notAvailable.disabled': 'Managed database rollback is not enabled for this instance yet.',
  'databaseRestore.notAvailable.noInstance_one':
    'Your plan includes a {count}-day recovery window, but no eligible database is provisioned.',
  'databaseRestore.notAvailable.noInstance_other':
    'Your plan includes a {count}-day recovery window, but no eligible database is provisioned.',
  'databaseRestore.notAvailable.plan':
    'Your current plan does not include database point-in-time restore. Upgrade to a plan with a recovery window to roll back to any moment.',
  'databaseRestore.notAvailable.viewPlans': 'View plans',
  'databaseRestore.instance.title': 'Managed database',
  'databaseRestore.instance.status': 'Status',
  'databaseRestore.instance.engine': 'Engine',
  'databaseRestore.instance.retention': 'Retention',
  'databaseRestore.instance.size': 'Size',
  'databaseRestore.instance.days_one': '{count} day',
  'databaseRestore.instance.days_other': '{count} days',
  'databaseRestore.instance.empty':
    'No managed database is provisioned for this project yet. Provision one to start capturing recovery points.',
  'databaseRestore.instance.provision': 'Provision database',
  'databaseRestore.recovery.title': 'Recovery points',
  'databaseRestore.recovery.takeSnapshot': 'Take snapshot',
  'databaseRestore.recovery.dateUnavailable': 'Date unavailable',
  'databaseRestore.recovery.continuousArchive': 'Continuous WAL archive',
  'databaseRestore.recovery.confirm': 'Restore the database to this recovery point? This replaces the current data.',
  'databaseRestore.recovery.restore': 'Restore to this point',
  'databaseRestore.recovery.emptyTitle': 'No recovery points yet',
  'databaseRestore.recovery.emptyDescription':
    'Automatic snapshots appear here as they are captured, or take one manually.',
  'databaseRestore.panel.title': 'Restore to a point in time',
  'databaseRestore.panel.window_one': 'Choose any moment in your {count}-day window, from {from} to {to}.',
  'databaseRestore.panel.window_other': 'Choose any moment in your {count}-day window, from {from} to {to}.',
  'databaseRestore.panel.noWindow': 'The continuous restore window becomes available once a database is provisioned.',
  'databaseRestore.panel.targetTime': 'Target time',
  'databaseRestore.panel.outOfRange': 'Target is outside your retention window.',
  'databaseRestore.panel.confirm':
    'Restore the database to the selected time? This replaces the current data with the state at that moment.',
  'databaseRestore.panel.requesting': 'Requesting…',
  'databaseRestore.panel.restore': 'Restore to this time',
  'databaseRestore.panel.warning':
    'A restore replays the write-ahead log to your chosen instant. The current data is replaced — this cannot be undone.',
  'databaseRestore.history.title': 'Restore history',
  'databaseRestore.history.latest': 'Latest',
  'databaseRestore.history.requested': 'requested {date}',
  'databaseRestore.history.safeError': 'The restore did not complete. Try again or contact support.',
  'databaseRestore.confirm.title': 'Restore database?',
  'databaseRestore.confirm.label': 'Restore',
  'databaseRestore.kind.manual': 'Manual',
  'databaseRestore.kind.automatic': 'Automatic',
  'databaseRestore.status.pending': 'Pending',
  'databaseRestore.status.queued': 'Queued',
  'databaseRestore.status.running': 'In progress',
  'databaseRestore.status.completed': 'Completed',
  'databaseRestore.status.failed': 'Failed',
  'databaseRestore.status.canceled': 'Canceled',
} as const;

export type DatabaseRestoreKey = keyof typeof databaseRestoreEn;
export type DatabaseRestoreCopy = Readonly<Record<DatabaseRestoreKey, string>>;

export const databaseRestoreFr: DatabaseRestoreCopy = {
  'databaseRestore.metaTitle': 'Restauration de base de données - E-Code',
  'databaseRestore.errors.projectNotFound': 'Projet introuvable.',
  'databaseRestore.errors.projectUnavailable': 'Impossible de charger le projet.',
  'databaseRestore.errors.panelUnavailable': 'Le panneau de restauration de la base de données est indisponible.',
  'databaseRestore.errors.requestFailed': 'Impossible de traiter la demande concernant la base de données.',
  'databaseRestore.errors.invalidAction': 'Choisissez une action valide pour la base de données.',
  'databaseRestore.errors.targetRequired': 'Choisissez un point de restauration ou un instant cible.',
  'databaseRestore.errors.invalidTarget': 'Choisissez un instant cible valide.',
  'databaseRestore.errors.restoreFailed': 'Impossible de terminer cette restauration.',
  'databaseRestore.title': 'Restauration à un instant précis',
  'databaseRestore.description':
    'Rétablissez la base de données gérée de ce projet à un instant précis compris dans la fenêtre de conservation de votre forfait.',
  'databaseRestore.success.restore': 'Restauration demandée — suivez sa progression dans l’historique ci-dessous.',
  'databaseRestore.success.snapshot':
    'Instantané demandé — il apparaîtra parmi les points de restauration dès qu’il sera prêt.',
  'databaseRestore.success.provision': 'Provisionnement de la base de données demandé.',
  'databaseRestore.notAvailable.title': 'La restauration à un instant précis n’est pas disponible',
  'databaseRestore.notAvailable.disabled':
    'Le retour arrière de la base de données gérée n’est pas encore activé pour cette instance.',
  'databaseRestore.notAvailable.noInstance_one':
    'Votre forfait comprend une fenêtre de restauration de {count} jour, mais aucune base de données admissible n’est provisionnée.',
  'databaseRestore.notAvailable.noInstance_other':
    'Votre forfait comprend une fenêtre de restauration de {count} jours, mais aucune base de données admissible n’est provisionnée.',
  'databaseRestore.notAvailable.plan':
    'Votre forfait actuel ne comprend pas la restauration de base de données à un instant précis. Passez à un forfait doté d’une fenêtre de restauration pour pouvoir revenir à tout moment.',
  'databaseRestore.notAvailable.viewPlans': 'Voir les forfaits',
  'databaseRestore.instance.title': 'Base de données gérée',
  'databaseRestore.instance.status': 'État',
  'databaseRestore.instance.engine': 'Moteur',
  'databaseRestore.instance.retention': 'Conservation',
  'databaseRestore.instance.size': 'Taille',
  'databaseRestore.instance.days_one': '{count} jour',
  'databaseRestore.instance.days_other': '{count} jours',
  'databaseRestore.instance.empty':
    'Aucune base de données gérée n’est encore provisionnée pour ce projet. Provisionnez-en une pour commencer à capturer des points de restauration.',
  'databaseRestore.instance.provision': 'Provisionner la base de données',
  'databaseRestore.recovery.title': 'Points de restauration',
  'databaseRestore.recovery.takeSnapshot': 'Créer un instantané',
  'databaseRestore.recovery.dateUnavailable': 'Date indisponible',
  'databaseRestore.recovery.continuousArchive': 'Archive WAL continue',
  'databaseRestore.recovery.confirm':
    'Restaurer la base de données à ce point de restauration ? Les données actuelles seront remplacées.',
  'databaseRestore.recovery.restore': 'Restaurer à ce point',
  'databaseRestore.recovery.emptyTitle': 'Aucun point de restauration pour le moment',
  'databaseRestore.recovery.emptyDescription':
    'Les instantanés automatiques apparaissent ici à mesure de leur capture. Vous pouvez aussi en créer un manuellement.',
  'databaseRestore.panel.title': 'Restaurer à un instant précis',
  'databaseRestore.panel.window_one':
    'Choisissez un instant dans votre fenêtre de {count} jour, entre le {from} et le {to}.',
  'databaseRestore.panel.window_other':
    'Choisissez un instant dans votre fenêtre de {count} jours, entre le {from} et le {to}.',
  'databaseRestore.panel.noWindow':
    'La fenêtre de restauration continue devient disponible dès qu’une base de données est provisionnée.',
  'databaseRestore.panel.targetTime': 'Instant cible',
  'databaseRestore.panel.outOfRange': 'L’instant cible se trouve hors de votre fenêtre de conservation.',
  'databaseRestore.panel.confirm':
    'Restaurer la base de données à l’instant sélectionné ? Les données actuelles seront remplacées par leur état à cet instant.',
  'databaseRestore.panel.requesting': 'Demande en cours…',
  'databaseRestore.panel.restore': 'Restaurer à cet instant',
  'databaseRestore.panel.warning':
    'Une restauration rejoue le journal d’écriture jusqu’à l’instant choisi. Les données actuelles seront remplacées — cette opération est irréversible.',
  'databaseRestore.history.title': 'Historique des restaurations',
  'databaseRestore.history.latest': 'Dernier état',
  'databaseRestore.history.requested': 'demandée le {date}',
  'databaseRestore.history.safeError': 'La restauration n’a pas abouti. Réessayez ou contactez l’assistance.',
  'databaseRestore.confirm.title': 'Restaurer la base de données ?',
  'databaseRestore.confirm.label': 'Restaurer',
  'databaseRestore.kind.manual': 'Manuel',
  'databaseRestore.kind.automatic': 'Automatique',
  'databaseRestore.status.pending': 'En attente',
  'databaseRestore.status.queued': 'Dans la file d’attente',
  'databaseRestore.status.running': 'En cours',
  'databaseRestore.status.completed': 'Terminée',
  'databaseRestore.status.failed': 'Échouée',
  'databaseRestore.status.canceled': 'Annulée',
};

export function getDatabaseRestoreCopy(language?: string | null): DatabaseRestoreCopy {
  return resolveMarketingLanguage(language) === 'fr' ? databaseRestoreFr : databaseRestoreEn;
}

export function formatDatabaseRestoreCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function selectDatabaseRestorePlural(
  copy: DatabaseRestoreCopy,
  key: 'databaseRestore.instance.days' | 'databaseRestore.notAvailable.noInstance' | 'databaseRestore.panel.window',
  count: number,
  language?: string | null,
): string {
  const locale = resolveMarketingLanguage(language);
  const category = new Intl.PluralRules(locale === 'fr' ? 'fr-FR' : 'en-US').select(count);
  const suffix = category === 'one' ? '_one' : '_other';

  return copy[`${key}${suffix}` as DatabaseRestoreKey];
}

export function formatDatabaseRestoreBytes(bytes: number, language?: string | null): string {
  const locale = resolveMarketingLanguage(language);
  const safeBytes = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const units = locale === 'fr' ? ['o', 'Ko', 'Mo', 'Go', 'To'] : ['B', 'KB', 'MB', 'GB', 'TB'];

  if (safeBytes === 0) {
    return `0 ${units[0]}`;
  }

  const exponent = Math.min(Math.floor(Math.log(safeBytes) / Math.log(1024)), units.length - 1);
  const value = safeBytes / 1024 ** exponent;

  const formatted = new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: exponent === 0 ? 0 : 1,
  }).format(value);

  return `${formatted} ${units[exponent]}`;
}

export function formatDatabaseRestoreDate(value: string, language?: string | null): string | null {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}

export function databaseRestoreStatusLabel(status: string, copy: DatabaseRestoreCopy): string {
  const normalized = status.trim().toLowerCase();

  const known: Readonly<Record<string, DatabaseRestoreKey>> = {
    pending: 'databaseRestore.status.pending',
    queued: 'databaseRestore.status.queued',
    running: 'databaseRestore.status.running',
    in_progress: 'databaseRestore.status.running',
    completed: 'databaseRestore.status.completed',
    failed: 'databaseRestore.status.failed',
    canceled: 'databaseRestore.status.canceled',
    cancelled: 'databaseRestore.status.canceled',
  };

  const key = known[normalized];

  return key ? copy[key] : status;
}

export function resolveDatabaseRestoreLanguage(language?: string | null): MarketingLanguage {
  return resolveMarketingLanguage(language);
}
