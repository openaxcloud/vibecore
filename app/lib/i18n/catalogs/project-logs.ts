import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const projectLogsEn = {
  'projectLogs.meta.title': 'Project logs - E-Code',
  'projectLogs.meta.description': 'Inspect live runtime output for an E-Code project workspace.',
  'projectLogs.page.title': 'Logs',
  'projectLogs.page.description': 'Live output from your running project.',
  'projectLogs.workspace.status': 'Workspace: {status}',
  'projectLogs.workspace.live': 'Live updates',
  'projectLogs.actions.refresh': 'Refresh',
  'projectLogs.actions.refreshing': 'Refreshing…',
  'projectLogs.state.noWorkspace': 'No workspace has been started for this project yet.',
  'projectLogs.state.unavailable': 'Project logs are temporarily unavailable. Refresh to reconnect.',
  'projectLogs.state.empty': 'No runtime output has been captured yet.',
  'projectLogs.status.starting': 'Starting',
  'projectLogs.status.pending': 'Pending',
  'projectLogs.status.running': 'Running',
  'projectLogs.status.ready': 'Ready',
  'projectLogs.status.stopping': 'Stopping',
  'projectLogs.status.stopped': 'Stopped',
  'projectLogs.status.paused': 'Paused',
  'projectLogs.status.failed': 'Failed',
  'projectLogs.status.error': 'Error',
  'projectLogs.status.unknown': 'Status unavailable',
} as const;

export type ProjectLogsKey = keyof typeof projectLogsEn;
export type ProjectLogsCopy = Readonly<Record<ProjectLogsKey, string>>;

export const projectLogsFr: ProjectLogsCopy = {
  'projectLogs.meta.title': 'Journaux du projet - E-Code',
  'projectLogs.meta.description':
    'Consultez en direct la sortie de l’environnement d’exécution d’un espace de travail E-Code.',
  'projectLogs.page.title': 'Journaux',
  'projectLogs.page.description': 'Sortie en direct de votre projet en cours d’exécution.',
  'projectLogs.workspace.status': 'Espace de travail : {status}',
  'projectLogs.workspace.live': 'Mises à jour en direct',
  'projectLogs.actions.refresh': 'Actualiser',
  'projectLogs.actions.refreshing': 'Actualisation…',
  'projectLogs.state.noWorkspace': 'Aucun espace de travail n’a encore été démarré pour ce projet.',
  'projectLogs.state.unavailable':
    'Les journaux du projet sont temporairement indisponibles. Actualisez pour vous reconnecter.',
  'projectLogs.state.empty': 'Aucune sortie de l’environnement d’exécution n’a encore été enregistrée.',
  'projectLogs.status.starting': 'Démarrage',
  'projectLogs.status.pending': 'En attente',
  'projectLogs.status.running': 'En cours d’exécution',
  'projectLogs.status.ready': 'Prêt',
  'projectLogs.status.stopping': 'Arrêt',
  'projectLogs.status.stopped': 'Arrêté',
  'projectLogs.status.paused': 'Suspendu',
  'projectLogs.status.failed': 'Échec',
  'projectLogs.status.error': 'Erreur',
  'projectLogs.status.unknown': 'État indisponible',
};

export function getProjectLogsCopy(language?: string | null): ProjectLogsCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? projectLogsFr : projectLogsEn;
}

export function formatProjectLogsCopy(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/gu, (token, key: string) => values[key] ?? token);
}

const STATUS_KEYS = new Set([
  'starting',
  'pending',
  'running',
  'ready',
  'stopping',
  'stopped',
  'paused',
  'failed',
  'error',
]);

export function projectLogsStatusLabel(status: string, language?: string | null): string {
  const normalized = status.trim().toLowerCase();

  const key = STATUS_KEYS.has(normalized)
    ? (`projectLogs.status.${normalized}` as ProjectLogsKey)
    : 'projectLogs.status.unknown';

  return getProjectLogsCopy(language)[key];
}
