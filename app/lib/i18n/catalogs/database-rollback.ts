import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const databaseRollbackEn = {
  'databaseRollback.loading': 'Loading database recovery controls',
  'databaseRollback.title': 'Database',
  'databaseRollback.entitlement.allowed_one': 'Point-in-time rollback for up to {count} day with your plan.',
  'databaseRollback.entitlement.allowed_other': 'Point-in-time rollback for up to {count} days with your plan.',
  'databaseRollback.entitlement.pro': 'Point-in-time rollback is available with the Pro plan.',
  'databaseRollback.action.setup': 'Set up database',
  'databaseRollback.action.settingUp': 'Setting up…',
  'databaseRollback.action.snapshot': 'Create snapshot',
  'databaseRollback.action.working': 'Working…',
  'databaseRollback.restore.label': 'Restore to a point in time',
  'databaseRollback.restore.action': 'Restore',
  'databaseRollback.restore.requesting': 'Requesting…',
  'databaseRollback.restore.error': 'The database operation could not be completed. Try again.',
  'databaseRollback.snapshots.title': 'Recovery points',
  'databaseRollback.snapshots.empty': 'No snapshots yet.',
  'databaseRollback.restores.title': 'Restores',
  'databaseRollback.dialog.title': 'Restore the database?',
  'databaseRollback.dialog.description':
    'This rewinds the database to {date}. Changes written after that point will be lost, and the operation cannot be undone.',
  'databaseRollback.dialog.targetRequired': 'Choose a point in time to restore.',
  'databaseRollback.dialog.confirm': 'Restore database',
  'databaseRollback.dialog.cancel': 'Cancel',
  'databaseRollback.status.running': 'Running',
  'databaseRollback.status.ready': 'Ready',
  'databaseRollback.status.pending': 'Pending',
  'databaseRollback.status.processing': 'Processing',
  'databaseRollback.status.completed': 'Completed',
  'databaseRollback.status.failed': 'Failed',
  'databaseRollback.status.stopped': 'Stopped',
  'databaseRollback.status.unknown': 'Status unavailable',
  'databaseRollback.snapshot.manual': 'Manual snapshot',
  'databaseRollback.snapshot.scheduled': 'Scheduled snapshot',
  'databaseRollback.snapshot.unknown': 'Snapshot',
} as const;

export type DatabaseRollbackKey = keyof typeof databaseRollbackEn;
export type DatabaseRollbackCopy = Readonly<Record<DatabaseRollbackKey, string>>;

export const databaseRollbackFr: DatabaseRollbackCopy = {
  'databaseRollback.loading': 'Chargement des contrôles de restauration de la base de données',
  'databaseRollback.title': 'Base de données',
  'databaseRollback.entitlement.allowed_one': 'Restauration à un instant précis jusqu’à {count} jour avec votre offre.',
  'databaseRollback.entitlement.allowed_other':
    'Restauration à un instant précis jusqu’à {count} jours avec votre offre.',
  'databaseRollback.entitlement.pro': 'La restauration à un instant précis est disponible avec l’offre Pro.',
  'databaseRollback.action.setup': 'Configurer la base de données',
  'databaseRollback.action.settingUp': 'Configuration…',
  'databaseRollback.action.snapshot': 'Créer un instantané',
  'databaseRollback.action.working': 'Traitement…',
  'databaseRollback.restore.label': 'Restaurer à un instant précis',
  'databaseRollback.restore.action': 'Restaurer',
  'databaseRollback.restore.requesting': 'Demande en cours…',
  'databaseRollback.restore.error': 'Impossible d’effectuer l’opération sur la base de données. Réessayez.',
  'databaseRollback.snapshots.title': 'Points de restauration',
  'databaseRollback.snapshots.empty': 'Aucun instantané pour le moment.',
  'databaseRollback.restores.title': 'Restaurations',
  'databaseRollback.dialog.title': 'Restaurer la base de données ?',
  'databaseRollback.dialog.description':
    'La base de données sera ramenée à son état du {date}. Les modifications enregistrées après cet instant seront perdues, et cette opération est irréversible.',
  'databaseRollback.dialog.targetRequired': 'Choisissez un instant auquel restaurer la base de données.',
  'databaseRollback.dialog.confirm': 'Restaurer la base de données',
  'databaseRollback.dialog.cancel': 'Annuler',
  'databaseRollback.status.running': 'En cours d’exécution',
  'databaseRollback.status.ready': 'Prête',
  'databaseRollback.status.pending': 'En attente',
  'databaseRollback.status.processing': 'Traitement en cours',
  'databaseRollback.status.completed': 'Terminée',
  'databaseRollback.status.failed': 'Échec',
  'databaseRollback.status.stopped': 'Arrêtée',
  'databaseRollback.status.unknown': 'État indisponible',
  'databaseRollback.snapshot.manual': 'Instantané manuel',
  'databaseRollback.snapshot.scheduled': 'Instantané planifié',
  'databaseRollback.snapshot.unknown': 'Instantané',
};

export function getDatabaseRollbackCopy(language?: string | null): DatabaseRollbackCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? databaseRollbackFr : databaseRollbackEn;
}

export function resolveDatabaseRollbackLanguage(language?: string | null): 'en' | 'fr' {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

export function formatDatabaseRollbackCopy(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/gu, (token, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : token,
  );
}

export function formatDatabaseRetention(days: number, language?: string | null): string {
  const resolved = resolveDatabaseRollbackLanguage(language);
  const locale = resolved === 'fr' ? 'fr-FR' : 'en-US';
  const copy = getDatabaseRollbackCopy(resolved);

  const template =
    new Intl.PluralRules(locale).select(days) === 'one'
      ? copy['databaseRollback.entitlement.allowed_one']
      : copy['databaseRollback.entitlement.allowed_other'];

  return formatDatabaseRollbackCopy(template, { count: new Intl.NumberFormat(locale).format(days) });
}

export function formatDatabaseBytes(bytes: number, language?: string | null): string {
  const resolved = resolveDatabaseRollbackLanguage(language);
  const locale = resolved === 'fr' ? 'fr-FR' : 'en-US';
  const units = resolved === 'fr' ? ['o', 'Kio', 'Mio', 'Gio', 'Tio'] : ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const exponent = bytes <= 0 ? 0 : Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes <= 0 ? 0 : bytes / 1024 ** exponent;

  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: exponent === 0 ? 0 : 1 }).format(value)}\u00a0${units[exponent]}`;
}

const DATABASE_STATUSES = new Set(['running', 'ready', 'pending', 'processing', 'completed', 'failed', 'stopped']);

export function databaseRollbackStatusLabel(status: string, language?: string | null): string {
  const normalized = status.trim().toLowerCase();

  const key = DATABASE_STATUSES.has(normalized)
    ? (`databaseRollback.status.${normalized}` as DatabaseRollbackKey)
    : 'databaseRollback.status.unknown';

  return getDatabaseRollbackCopy(language)[key];
}

export function databaseSnapshotKindLabel(kind: string, language?: string | null): string {
  const normalized = kind.trim().toLowerCase();

  const key =
    normalized === 'manual'
      ? 'databaseRollback.snapshot.manual'
      : normalized === 'scheduled'
        ? 'databaseRollback.snapshot.scheduled'
        : 'databaseRollback.snapshot.unknown';

  return getDatabaseRollbackCopy(language)[key];
}
