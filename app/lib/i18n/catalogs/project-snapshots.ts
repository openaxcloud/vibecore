import { normalizeSupportedLanguage } from '~/lib/i18n/language';
import { formatUserAreaNumber } from '~/lib/i18n/user-area-locale';

export type ProjectSnapshotsLanguage = 'en' | 'fr';

export const projectSnapshotsEn = {
  'projectSnapshots.meta.title': 'Project snapshots — E-Code',
  'projectSnapshots.meta.description': 'Create, compare and restore persistent checkpoints for your E-Code project.',
  'projectSnapshots.page.title': 'Snapshots',
  'projectSnapshots.page.description': 'Manual and automatic project checkpoints for rollback, AI safety and exports.',
  'projectSnapshots.list.title': 'Project snapshots',
  'projectSnapshots.list.count_one': '{count} snapshot',
  'projectSnapshots.list.count_other': '{count} snapshots',
  'projectSnapshots.list.loading': 'Loading project snapshots',
  'projectSnapshots.list.errorTitle': 'Project snapshots could not load',
  'projectSnapshots.list.errorDescription': 'Your snapshots were not changed. Reload this panel to try again.',
  'projectSnapshots.list.retry': 'Reload snapshots',
  'projectSnapshots.list.emptyTitle': 'No snapshots yet',
  'projectSnapshots.list.emptyDescription': 'Create a snapshot from the project’s persistent files.',
  'projectSnapshots.snapshot.recorded': 'Date unavailable',
  'projectSnapshots.snapshot.size': '{kind} · {size}',
  'projectSnapshots.snapshot.identifier': 'ID: {id}',
  'projectSnapshots.snapshot.beforeRestore': 'Before restoring “{label}”',
  'projectSnapshots.kind.manual': 'Manual',
  'projectSnapshots.kind.automatic': 'Automatic',
  'projectSnapshots.kind.beforeAiChange': 'Before an AI change',
  'projectSnapshots.kind.snapshot': 'Snapshot',
  'projectSnapshots.create.title': 'Create a snapshot',
  'projectSnapshots.create.description': 'Capture the project’s current persistent files before an important change.',
  'projectSnapshots.create.label': 'Snapshot name',
  'projectSnapshots.create.placeholder': 'Manual checkpoint',
  'projectSnapshots.create.submit': 'Create snapshot',
  'projectSnapshots.create.busy': 'Creating snapshot…',
  'projectSnapshots.restore.open': 'Restore {label}',
  'projectSnapshots.restore.title': 'Restore “{label}”?',
  'projectSnapshots.restore.confirm': 'Restore snapshot',
  'projectSnapshots.restore.cancel': 'Cancel',
  'projectSnapshots.restore.loadingPreview': 'Comparing the snapshot with the current project files…',
  'projectSnapshots.restore.previewUnavailable':
    'The change summary is unavailable. You can still restore this snapshot.',
  'projectSnapshots.restore.safetyDescription':
    'Restoring replaces the current project files. A safety snapshot of the current state is created first.',
  'projectSnapshots.restore.noDifferences_one':
    'No differences — the project already matches this snapshot ({count} file unchanged).',
  'projectSnapshots.restore.noDifferences_other':
    'No differences — the project already matches this snapshot ({count} files unchanged).',
  'projectSnapshots.restore.added_one': '+{count} added',
  'projectSnapshots.restore.added_other': '+{count} added',
  'projectSnapshots.restore.changed_one': '~{count} changed',
  'projectSnapshots.restore.changed_other': '~{count} changed',
  'projectSnapshots.restore.removed_one': '−{count} removed',
  'projectSnapshots.restore.removed_other': '−{count} removed',
  'projectSnapshots.restore.unchanged_one': '{count} unchanged',
  'projectSnapshots.restore.unchanged_other': '{count} unchanged',
  'projectSnapshots.restore.more_one': '…and {count} more',
  'projectSnapshots.restore.more_other': '…and {count} more',
  'projectSnapshots.restore.truncated': 'File lists are capped; the counts above are exact.',
  'projectSnapshots.status.restored': 'Restored “{label}”.',
  'projectSnapshots.status.restoredWithSafety': 'Restored “{label}”. A safety snapshot was created first.',
  'projectSnapshots.error.projectUnavailable': 'The project is unavailable. Reload the page and try again.',
  'projectSnapshots.error.snapshotRequired': 'Choose a snapshot and try again.',
  'projectSnapshots.error.unsupported': 'Choose a valid snapshot action.',
  'projectSnapshots.error.forbidden': 'You do not have permission to complete this snapshot action.',
  'projectSnapshots.error.notFound': 'This snapshot is no longer available. Reload the list and try again.',
  'projectSnapshots.error.conflict': 'This snapshot can no longer be restored safely. Reload the list and try again.',
  'projectSnapshots.error.rateLimited': 'Too many snapshot requests were sent. Wait a moment and try again.',
  'projectSnapshots.error.rejected': 'The snapshot action was rejected. Check your request and try again.',
  'projectSnapshots.error.unavailable': 'Snapshots are temporarily unavailable. Please try again in a moment.',
} as const;

export type ProjectSnapshotsKey = keyof typeof projectSnapshotsEn;
export type ProjectSnapshotsCopy = Readonly<Record<ProjectSnapshotsKey, string>>;

export const projectSnapshotsFr: ProjectSnapshotsCopy = {
  'projectSnapshots.meta.title': 'Instantanés du projet — E-Code',
  'projectSnapshots.meta.description':
    'Créez, comparez et restaurez des points de contrôle persistants pour votre projet E-Code.',
  'projectSnapshots.page.title': 'Instantanés',
  'projectSnapshots.page.description':
    'Points de contrôle manuels et automatiques pour revenir en arrière, sécuriser les modifications de l’IA et exporter le projet.',
  'projectSnapshots.list.title': 'Instantanés du projet',
  'projectSnapshots.list.count_one': '{count} instantané',
  'projectSnapshots.list.count_other': '{count} instantanés',
  'projectSnapshots.list.loading': 'Chargement des instantanés du projet',
  'projectSnapshots.list.errorTitle': 'Impossible de charger les instantanés du projet',
  'projectSnapshots.list.errorDescription':
    'Vos instantanés n’ont pas été modifiés. Rechargez ce panneau pour réessayer.',
  'projectSnapshots.list.retry': 'Recharger les instantanés',
  'projectSnapshots.list.emptyTitle': 'Aucun instantané pour le moment',
  'projectSnapshots.list.emptyDescription': 'Créez un instantané à partir des fichiers persistants du projet.',
  'projectSnapshots.snapshot.recorded': 'Date indisponible',
  'projectSnapshots.snapshot.size': '{kind} · {size}',
  'projectSnapshots.snapshot.identifier': 'ID : {id}',
  'projectSnapshots.snapshot.beforeRestore': 'Avant la restauration de « {label} »',
  'projectSnapshots.kind.manual': 'Manuel',
  'projectSnapshots.kind.automatic': 'Automatique',
  'projectSnapshots.kind.beforeAiChange': 'Avant une modification de l’IA',
  'projectSnapshots.kind.snapshot': 'Instantané',
  'projectSnapshots.create.title': 'Créer un instantané',
  'projectSnapshots.create.description':
    'Capturez les fichiers persistants actuels du projet avant une modification importante.',
  'projectSnapshots.create.label': 'Nom de l’instantané',
  'projectSnapshots.create.placeholder': 'Point de contrôle manuel',
  'projectSnapshots.create.submit': 'Créer l’instantané',
  'projectSnapshots.create.busy': 'Création de l’instantané…',
  'projectSnapshots.restore.open': 'Restaurer {label}',
  'projectSnapshots.restore.title': 'Restaurer « {label} » ?',
  'projectSnapshots.restore.confirm': 'Restaurer l’instantané',
  'projectSnapshots.restore.cancel': 'Annuler',
  'projectSnapshots.restore.loadingPreview': 'Comparaison de l’instantané avec les fichiers actuels du projet…',
  'projectSnapshots.restore.previewUnavailable':
    'Le résumé des modifications est indisponible. Vous pouvez tout de même restaurer cet instantané.',
  'projectSnapshots.restore.safetyDescription':
    'La restauration remplace les fichiers actuels du projet. Un instantané de sécurité de l’état actuel est d’abord créé.',
  'projectSnapshots.restore.noDifferences_one':
    'Aucune différence — le projet correspond déjà à cet instantané ({count} fichier inchangé).',
  'projectSnapshots.restore.noDifferences_other':
    'Aucune différence — le projet correspond déjà à cet instantané ({count} fichiers inchangés).',
  'projectSnapshots.restore.added_one': '+{count} ajouté',
  'projectSnapshots.restore.added_other': '+{count} ajoutés',
  'projectSnapshots.restore.changed_one': '~{count} modifié',
  'projectSnapshots.restore.changed_other': '~{count} modifiés',
  'projectSnapshots.restore.removed_one': '−{count} supprimé',
  'projectSnapshots.restore.removed_other': '−{count} supprimés',
  'projectSnapshots.restore.unchanged_one': '{count} inchangé',
  'projectSnapshots.restore.unchanged_other': '{count} inchangés',
  'projectSnapshots.restore.more_one': '…et {count} autre',
  'projectSnapshots.restore.more_other': '…et {count} autres',
  'projectSnapshots.restore.truncated': 'Les listes de fichiers sont limitées ; les nombres ci-dessus sont exacts.',
  'projectSnapshots.status.restored': '« {label} » a été restauré.',
  'projectSnapshots.status.restoredWithSafety':
    '« {label} » a été restauré. Un instantané de sécurité a d’abord été créé.',
  'projectSnapshots.error.projectUnavailable': 'Le projet est indisponible. Rechargez la page, puis réessayez.',
  'projectSnapshots.error.snapshotRequired': 'Choisissez un instantané, puis réessayez.',
  'projectSnapshots.error.unsupported': 'Choisissez une action valide pour les instantanés.',
  'projectSnapshots.error.forbidden': 'Vous n’êtes pas autorisé à effectuer cette action sur les instantanés.',
  'projectSnapshots.error.notFound': 'Cet instantané n’est plus disponible. Rechargez la liste, puis réessayez.',
  'projectSnapshots.error.conflict':
    'Cet instantané ne peut plus être restauré en toute sécurité. Rechargez la liste, puis réessayez.',
  'projectSnapshots.error.rateLimited':
    'Trop de demandes concernant les instantanés ont été envoyées. Patientez un instant, puis réessayez.',
  'projectSnapshots.error.rejected': 'L’action sur l’instantané a été refusée. Vérifiez votre demande, puis réessayez.',
  'projectSnapshots.error.unavailable':
    'Les instantanés sont temporairement indisponibles. Réessayez dans quelques instants.',
};

export type ProjectSnapshotsErrorCode =
  | 'projectUnavailable'
  | 'snapshotRequired'
  | 'unsupported'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'rateLimited'
  | 'rejected'
  | 'unavailable';

const errorKeys: Readonly<Record<ProjectSnapshotsErrorCode, ProjectSnapshotsKey>> = {
  projectUnavailable: 'projectSnapshots.error.projectUnavailable',
  snapshotRequired: 'projectSnapshots.error.snapshotRequired',
  unsupported: 'projectSnapshots.error.unsupported',
  forbidden: 'projectSnapshots.error.forbidden',
  notFound: 'projectSnapshots.error.notFound',
  conflict: 'projectSnapshots.error.conflict',
  rateLimited: 'projectSnapshots.error.rateLimited',
  rejected: 'projectSnapshots.error.rejected',
  unavailable: 'projectSnapshots.error.unavailable',
};

type ProjectSnapshotsPluralKey =
  | 'projectSnapshots.list.count'
  | 'projectSnapshots.restore.noDifferences'
  | 'projectSnapshots.restore.added'
  | 'projectSnapshots.restore.changed'
  | 'projectSnapshots.restore.removed'
  | 'projectSnapshots.restore.unchanged'
  | 'projectSnapshots.restore.more';

export function resolveProjectSnapshotsLanguage(language?: string | null): ProjectSnapshotsLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

export function getProjectSnapshotsCopy(language?: string | null): ProjectSnapshotsCopy {
  return resolveProjectSnapshotsLanguage(language) === 'fr' ? projectSnapshotsFr : projectSnapshotsEn;
}

export function formatProjectSnapshotsCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatProjectSnapshotsPlural(
  key: ProjectSnapshotsPluralKey,
  count: number,
  language?: string | null,
): string {
  const resolvedLanguage = resolveProjectSnapshotsLanguage(language);
  const copy = getProjectSnapshotsCopy(resolvedLanguage);
  const category = new Intl.PluralRules(resolvedLanguage === 'fr' ? 'fr-FR' : 'en-GB').select(count);
  const suffix = category === 'one' ? '_one' : '_other';

  return formatProjectSnapshotsCopy(copy[`${key}${suffix}` as ProjectSnapshotsKey], {
    count: formatUserAreaNumber(count, undefined, resolvedLanguage),
  });
}

export function formatProjectSnapshotBytes(bytes: number | undefined, language?: string | null): string {
  const resolvedLanguage = resolveProjectSnapshotsLanguage(language);
  const safeBytes = typeof bytes === 'number' && Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const units = resolvedLanguage === 'fr' ? ['o', 'Ko', 'Mo', 'Go', 'To'] : ['B', 'KB', 'MB', 'GB', 'TB'];

  if (safeBytes === 0) {
    return `0\u00a0${units[0]}`;
  }

  const exponent = Math.min(Math.floor(Math.log(safeBytes) / Math.log(1024)), units.length - 1);
  const value = safeBytes / 1024 ** exponent;

  const formatted = formatUserAreaNumber(
    value,
    { minimumFractionDigits: 0, maximumFractionDigits: exponent === 0 ? 0 : 1 },
    resolvedLanguage,
  );

  return `${formatted}\u00a0${units[exponent]}`;
}

export function projectSnapshotKindLabel(kind: string | undefined, language?: string | null): string {
  const copy = getProjectSnapshotsCopy(language);

  const normalized =
    kind
      ?.trim()
      .toLowerCase()
      .replace(/[_\s]+/gu, '-') ?? '';
  const key: ProjectSnapshotsKey =
    normalized === 'manual'
      ? 'projectSnapshots.kind.manual'
      : normalized === 'automatic'
        ? 'projectSnapshots.kind.automatic'
        : normalized === 'before-ai-change' || normalized === 'ai-safety'
          ? 'projectSnapshots.kind.beforeAiChange'
          : 'projectSnapshots.kind.snapshot';

  return copy[key];
}

export function projectSnapshotDisplayLabel(
  label: string | undefined,
  kind: string | undefined,
  language?: string | null,
): string {
  const copy = getProjectSnapshotsCopy(language);
  const normalizedKind = kind?.trim().toLowerCase();
  const safetyPrefix = 'Before restore of ';

  /*
   * The restore API currently persists this English platform-owned prefix on
   * automatic safety snapshots. Translate only that exact system format while
   * preserving the nested snapshot label verbatim as user content.
   */
  if (normalizedKind === 'automatic' && label?.startsWith(safetyPrefix)) {
    const restoredLabel = label.slice(safetyPrefix.length).trim();

    if (restoredLabel) {
      return formatProjectSnapshotsCopy(copy['projectSnapshots.snapshot.beforeRestore'], { label: restoredLabel });
    }
  }

  return label ?? projectSnapshotKindLabel(kind, language);
}

export function projectSnapshotsErrorCodeForStatus(status: number): ProjectSnapshotsErrorCode {
  if (status === 403) {
    return 'forbidden';
  }

  if (status === 404) {
    return 'notFound';
  }

  if (status === 409) {
    return 'conflict';
  }

  if (status === 429) {
    return 'rateLimited';
  }

  return status >= 500 ? 'unavailable' : 'rejected';
}

export function projectSnapshotsErrorMessage(
  code: ProjectSnapshotsErrorCode | undefined,
  language?: string | null,
): string | undefined {
  return code ? getProjectSnapshotsCopy(language)[errorKeys[code]] : undefined;
}
