import { normalizeSupportedLanguage } from '~/lib/i18n/language';

/**
 * RPL-IDE-001.7 — copy for the Resources panel (RAM / CPU / Storage).
 *
 * "Not measured" and "not available" are deliberately distinct: the first means
 * the workspace answered but that particular figure has no honest value (an
 * unlimited cgroup, a host without the hierarchy), the second means the
 * workspace could not be reached at all. Collapsing them would hide which of
 * the two is happening.
 */
export const workspaceResourcesEn = {
  'workspaceResources.title': 'Resources',
  'workspaceResources.memory': 'RAM',
  'workspaceResources.cpu': 'CPU',
  'workspaceResources.storage': 'Storage',
  'workspaceResources.loading': 'Reading workspace resources…',
  'workspaceResources.unavailable': 'Resources are not available for this workspace right now.',
  'workspaceResources.notMeasured': 'Not measured',
  'workspaceResources.usedNoLimit': '{used} used · no limit',
  'workspaceResources.cores_one': '{count} core',
  'workspaceResources.cores_other': '{count} cores',
  'workspaceResources.refresh': 'Refresh resources',
  'workspaceResources.capturedAt': 'Measured at {time}',
} as const;

export type WorkspaceResourcesKey = keyof typeof workspaceResourcesEn;
export type WorkspaceResourcesCopy = Readonly<Record<WorkspaceResourcesKey, string>>;

export const workspaceResourcesFr: WorkspaceResourcesCopy = {
  'workspaceResources.title': 'Ressources',
  'workspaceResources.memory': 'RAM',
  'workspaceResources.cpu': 'CPU',
  'workspaceResources.storage': 'Stockage',
  'workspaceResources.loading': 'Lecture des ressources du workspace…',
  'workspaceResources.unavailable': 'Les ressources de ce workspace ne sont pas disponibles pour le moment.',
  'workspaceResources.notMeasured': 'Non mesuré',
  'workspaceResources.usedNoLimit': '{used} utilisés · sans limite',
  'workspaceResources.cores_one': '{count} cœur',
  'workspaceResources.cores_other': '{count} cœurs',
  'workspaceResources.refresh': 'Actualiser les ressources',
  'workspaceResources.capturedAt': 'Mesuré à {time}',
};

export function getWorkspaceResourcesCopy(language?: string | null): WorkspaceResourcesCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? workspaceResourcesFr : workspaceResourcesEn;
}
