import { auditActionLabel } from './audit-logs';
import { resolveMarketingLanguage } from './marketing';

export const projectOverviewPanelEn = {
  'projectOverview.panel.aria': 'Project overview for {project}',
  'projectOverview.kicker': 'Project overview',
  'projectOverview.project.fallback': 'Untitled project',
  'projectOverview.value.unknown': 'Unknown',
  'projectOverview.date.unavailable': 'Date unavailable',
  'projectOverview.source.label': 'Source: {source}',
  'projectOverview.source.github': 'GitHub',
  'projectOverview.source.gitlab': 'GitLab',
  'projectOverview.source.template': 'Template',
  'projectOverview.source.import': 'Import',
  'projectOverview.source.zip': 'ZIP archive',
  'projectOverview.source.blank': 'Blank project',
  'projectOverview.workspace.none': 'No workspace',
  'projectOverview.workspace.unavailable': 'Unavailable',
  'projectOverview.workspace.status.running': 'Running',
  'projectOverview.workspace.status.building': 'Building',
  'projectOverview.workspace.status.stopped': 'Stopped',
  'projectOverview.workspace.status.crashed': 'Crashed',
  'projectOverview.workspace.status.error': 'Error',
  'projectOverview.workspace.status.idle': 'Idle',
  'projectOverview.category.runtime': 'Runtime',
  'projectOverview.category.frontend': 'Frontend',
  'projectOverview.category.backend': 'Backend',
  'projectOverview.category.data': 'Data',
  'projectOverview.category.tooling': 'Tooling',
  'projectOverview.category.testing': 'Testing',
  'projectOverview.category.mobile': 'Mobile',
  'projectOverview.role.owner': 'Owner',
  'projectOverview.role.admin': 'Admin',
  'projectOverview.role.editor': 'Editor',
  'projectOverview.role.viewer': 'Viewer',
  'projectOverview.role.member': 'Member',
  'projectOverview.member.unknown': 'Unknown member',
  'projectOverview.member.status.member': 'Member',
  'projectOverview.member.status.active': 'Active',
  'projectOverview.member.status.editing': 'Editing',
  'projectOverview.member.status.online': 'Online',
  'projectOverview.member.status.present': 'Present',
  'projectOverview.member.status.invited': 'Invited',
  'projectOverview.member.status.offline': 'Offline',
  'projectOverview.member.status.idle': 'Idle',
  'projectOverview.activity.default': 'Project activity',
  'projectOverview.activity.filesImported': 'Project files imported from a ZIP archive',
  'projectOverview.activity.fileCreated': 'Project file created',
  'projectOverview.activity.fileUpdated': 'Project file updated',
  'projectOverview.activity.fileDeleted': 'Project file deleted',
  'projectOverview.activity.deploymentStarted': 'Project deployment started',
  'projectOverview.activity.deploymentCompleted': 'Project deployment completed',
  'projectOverview.activity.deploymentFailed': 'Project deployment failed',
  'projectOverview.activity.snapshotTaken': 'Project snapshot created',
  'projectOverview.metric.aria': '{label}: {value}. {detail}',
  'projectOverview.metric.files': 'Files',
  'projectOverview.metric.filesDetail': 'Tracked project files',
  'projectOverview.metric.branch': 'Branch',
  'projectOverview.metric.branchDetail': 'Current Git branch',
  'projectOverview.metric.workspace': 'Workspace',
  'projectOverview.metric.created': 'Created',
  'projectOverview.metric.updated': 'Updated {date}',
  'projectOverview.section.stack': 'Detected stack',
  'projectOverview.section.scripts': 'Available npm scripts',
  'projectOverview.section.members': 'Active members',
  'projectOverview.section.commits': 'Latest commits',
  'projectOverview.section.activity': 'Latest activity',
  'projectOverview.count.signals.one': '{count} signal',
  'projectOverview.count.signals.other': '{count} signals',
  'projectOverview.count.scripts.one': '{count} script',
  'projectOverview.count.scripts.other': '{count} scripts',
  'projectOverview.count.activeMembers.one': '{count} active member',
  'projectOverview.count.activeMembers.other': '{count} active members',
  'projectOverview.empty.stack':
    'No stack detected yet. Add a package.json or framework files to populate this section.',
  'projectOverview.empty.scripts': 'No npm scripts were found in the project manifests.',
  'projectOverview.empty.commits': 'No commits have been reported yet.',
  'projectOverview.empty.members': 'No collaborators or active sessions yet.',
  'projectOverview.empty.activity': 'No project activity yet.',
  'projectOverview.stack.detectedFrom': '{name}, detected from {source}',
  'projectOverview.script.aria': 'Script {name}: {command}',
  'projectOverview.section.resources': 'Workspace resources',
  'projectOverview.resources.memory': 'Memory',
  'projectOverview.resources.cpu': 'CPU',
  'projectOverview.resources.storage': 'Storage',
  'projectOverview.resources.unknown': 'Not reported',
  'projectOverview.resources.noLimit': 'No limit set',
  'projectOverview.resources.usedOfLimit': '{used} of {limit}',
  'projectOverview.resources.cpuCores': '{cores} core limit',
  'projectOverview.resources.cpuCoresPlural': '{cores} cores limit',
  'projectOverview.resources.cpuPending': 'Measuring — a usage ratio needs two samples',
  'projectOverview.resources.unavailable':
    'The workspace is not reporting resource usage right now. Nothing is shown rather than a made-up zero.',
  'projectOverview.resources.gaugeAria': '{label}: {value}. {detail}',
  'projectOverview.resources.measuredAt': 'Measured {date}',
} as const;

export type ProjectOverviewPanelKey = keyof typeof projectOverviewPanelEn;
export type ProjectOverviewPanelCopy = Readonly<Record<ProjectOverviewPanelKey, string>>;
export type ProjectOverviewPanelLanguage = 'en' | 'fr';

export const projectOverviewPanelFr: ProjectOverviewPanelCopy = {
  'projectOverview.panel.aria': 'Aperçu du projet {project}',
  'projectOverview.kicker': 'Aperçu du projet',
  'projectOverview.project.fallback': 'Projet sans titre',
  'projectOverview.value.unknown': 'Inconnu',
  'projectOverview.date.unavailable': 'Date indisponible',
  'projectOverview.source.label': 'Source : {source}',
  'projectOverview.source.github': 'GitHub',
  'projectOverview.source.gitlab': 'GitLab',
  'projectOverview.source.template': 'Modèle',
  'projectOverview.source.import': 'Import',
  'projectOverview.source.zip': 'Archive ZIP',
  'projectOverview.source.blank': 'Projet vierge',
  'projectOverview.workspace.none': 'Aucun espace de travail',
  'projectOverview.workspace.unavailable': 'Indisponible',
  'projectOverview.workspace.status.running': 'En cours',
  'projectOverview.workspace.status.building': 'Préparation',
  'projectOverview.workspace.status.stopped': 'Arrêté',
  'projectOverview.workspace.status.crashed': 'En panne',
  'projectOverview.workspace.status.error': 'Erreur',
  'projectOverview.workspace.status.idle': 'Inactif',
  'projectOverview.category.runtime': 'Environnement d’exécution',
  'projectOverview.category.frontend': 'Interface utilisateur',
  'projectOverview.category.backend': 'Service applicatif',
  'projectOverview.category.data': 'Données',
  'projectOverview.category.tooling': 'Outils',
  'projectOverview.category.testing': 'Tests',
  'projectOverview.category.mobile': 'Mobile',
  'projectOverview.role.owner': 'Propriétaire',
  'projectOverview.role.admin': 'Administrateur',
  'projectOverview.role.editor': 'Éditeur',
  'projectOverview.role.viewer': 'Lecteur',
  'projectOverview.role.member': 'Membre',
  'projectOverview.member.unknown': 'Membre inconnu',
  'projectOverview.member.status.member': 'Membre',
  'projectOverview.member.status.active': 'Actif',
  'projectOverview.member.status.editing': 'En édition',
  'projectOverview.member.status.online': 'En ligne',
  'projectOverview.member.status.present': 'Présent',
  'projectOverview.member.status.invited': 'Invité',
  'projectOverview.member.status.offline': 'Hors ligne',
  'projectOverview.member.status.idle': 'Inactif',
  'projectOverview.activity.default': 'Activité du projet',
  'projectOverview.activity.filesImported': 'Fichiers du projet importés depuis une archive ZIP',
  'projectOverview.activity.fileCreated': 'Fichier du projet créé',
  'projectOverview.activity.fileUpdated': 'Fichier du projet mis à jour',
  'projectOverview.activity.fileDeleted': 'Fichier du projet supprimé',
  'projectOverview.activity.deploymentStarted': 'Déploiement du projet démarré',
  'projectOverview.activity.deploymentCompleted': 'Déploiement du projet terminé',
  'projectOverview.activity.deploymentFailed': 'Échec du déploiement du projet',
  'projectOverview.activity.snapshotTaken': 'Instantané du projet créé',
  'projectOverview.metric.aria': '{label} : {value}. {detail}',
  'projectOverview.metric.files': 'Fichiers',
  'projectOverview.metric.filesDetail': 'Fichiers suivis dans le projet',
  'projectOverview.metric.branch': 'Branche',
  'projectOverview.metric.branchDetail': 'Branche Git actuelle',
  'projectOverview.metric.workspace': 'Espace de travail',
  'projectOverview.metric.created': 'Créé le',
  'projectOverview.metric.updated': 'Mis à jour le {date}',
  'projectOverview.section.stack': 'Stack détectée',
  'projectOverview.section.scripts': 'Scripts npm disponibles',
  'projectOverview.section.members': 'Membres actifs',
  'projectOverview.section.commits': 'Derniers commits',
  'projectOverview.section.activity': 'Activité récente',
  'projectOverview.count.signals.one': '{count} signal',
  'projectOverview.count.signals.other': '{count} signaux',
  'projectOverview.count.scripts.one': '{count} script',
  'projectOverview.count.scripts.other': '{count} scripts',
  'projectOverview.count.activeMembers.one': '{count} membre actif',
  'projectOverview.count.activeMembers.other': '{count} membres actifs',
  'projectOverview.empty.stack':
    'Aucune pile technique détectée pour le moment. Ajoutez un fichier package.json ou les fichiers d’un framework pour alimenter cette section.',
  'projectOverview.empty.scripts': 'Aucun script npm trouvé dans les manifestes du projet.',
  'projectOverview.empty.commits': 'Aucun commit signalé pour le moment.',
  'projectOverview.empty.members': 'Aucun collaborateur ni aucune session active pour le moment.',
  'projectOverview.empty.activity': 'Aucune activité du projet pour le moment.',
  'projectOverview.stack.detectedFrom': '{name}, détecté depuis {source}',
  'projectOverview.script.aria': 'Script {name} : {command}',
  'projectOverview.section.resources': 'Ressources de l’espace de travail',
  'projectOverview.resources.memory': 'Mémoire',
  'projectOverview.resources.cpu': 'Processeur',
  'projectOverview.resources.storage': 'Stockage',
  'projectOverview.resources.unknown': 'Non communiqué',
  'projectOverview.resources.noLimit': 'Aucune limite posée',
  'projectOverview.resources.usedOfLimit': '{used} sur {limit}',
  'projectOverview.resources.cpuCores': 'Limite de {cores} cœur',
  'projectOverview.resources.cpuCoresPlural': 'Limite de {cores} cœurs',
  'projectOverview.resources.cpuPending': 'Mesure en cours — un taux d’usage demande deux relevés',
  'projectOverview.resources.unavailable':
    'L’espace de travail ne communique pas sa consommation pour le moment. Rien n’est affiché plutôt qu’un zéro inventé.',
  'projectOverview.resources.gaugeAria': '{label} : {value}. {detail}',
  'projectOverview.resources.measuredAt': 'Relevé {date}',
};

type ProjectOverviewInterpolationValue = string | number | bigint;

const sourceKeys: Readonly<Record<string, ProjectOverviewPanelKey>> = {
  github: 'projectOverview.source.github',
  gitlab: 'projectOverview.source.gitlab',
  template: 'projectOverview.source.template',
  import: 'projectOverview.source.import',
  zip: 'projectOverview.source.zip',
  blank: 'projectOverview.source.blank',
};

const workspaceStatusKeys: Readonly<Record<string, ProjectOverviewPanelKey>> = {
  'no workspace': 'projectOverview.workspace.none',
  none: 'projectOverview.workspace.none',
  unavailable: 'projectOverview.workspace.unavailable',
  running: 'projectOverview.workspace.status.running',
  building: 'projectOverview.workspace.status.building',
  stopped: 'projectOverview.workspace.status.stopped',
  crashed: 'projectOverview.workspace.status.crashed',
  error: 'projectOverview.workspace.status.error',
  idle: 'projectOverview.workspace.status.idle',
};

const categoryKeys: Readonly<Record<string, ProjectOverviewPanelKey>> = {
  runtime: 'projectOverview.category.runtime',
  frontend: 'projectOverview.category.frontend',
  backend: 'projectOverview.category.backend',
  data: 'projectOverview.category.data',
  tooling: 'projectOverview.category.tooling',
  testing: 'projectOverview.category.testing',
  mobile: 'projectOverview.category.mobile',
};

const roleKeys: Readonly<Record<string, ProjectOverviewPanelKey>> = {
  owner: 'projectOverview.role.owner',
  admin: 'projectOverview.role.admin',
  editor: 'projectOverview.role.editor',
  viewer: 'projectOverview.role.viewer',
  member: 'projectOverview.role.member',
};

const memberStatusKeys: Readonly<Record<string, ProjectOverviewPanelKey>> = {
  member: 'projectOverview.member.status.member',
  active: 'projectOverview.member.status.active',
  editing: 'projectOverview.member.status.editing',
  online: 'projectOverview.member.status.online',
  present: 'projectOverview.member.status.present',
  invited: 'projectOverview.member.status.invited',
  offline: 'projectOverview.member.status.offline',
  idle: 'projectOverview.member.status.idle',
};

const activityKeys: Readonly<Record<string, ProjectOverviewPanelKey>> = {
  'project.files.import_zip': 'projectOverview.activity.filesImported',
  'project.file.created': 'projectOverview.activity.fileCreated',
  'project.file.updated': 'projectOverview.activity.fileUpdated',
  'project.file.deleted': 'projectOverview.activity.fileDeleted',
  'project.deployment.started': 'projectOverview.activity.deploymentStarted',
  'project.deployment.completed': 'projectOverview.activity.deploymentCompleted',
  'project.deployment.failed': 'projectOverview.activity.deploymentFailed',
  'project.snapshot.taken': 'projectOverview.activity.snapshotTaken',
};

export function resolveProjectOverviewPanelLanguage(language?: string | null): ProjectOverviewPanelLanguage {
  return resolveMarketingLanguage(language);
}

export function getProjectOverviewPanelCopy(language?: string | null): ProjectOverviewPanelCopy {
  return resolveProjectOverviewPanelLanguage(language) === 'fr' ? projectOverviewPanelFr : projectOverviewPanelEn;
}

export function formatProjectOverviewPanelCopy(
  template: string,
  values: Readonly<Record<string, ProjectOverviewInterpolationValue>> = {},
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatProjectOverviewPanelNumber(value: number | bigint, language?: string | null): string {
  return new Intl.NumberFormat(resolveProjectOverviewPanelLanguage(language) === 'fr' ? 'fr-FR' : 'en-US').format(
    value,
  );
}

export function formatProjectOverviewPanelCount(
  language: string | null | undefined,
  count: number,
  forms: Readonly<{ one: string; other: string }>,
): string {
  const locale = resolveProjectOverviewPanelLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
  const template = new Intl.PluralRules(locale).select(count) === 'one' ? forms.one : forms.other;

  return formatProjectOverviewPanelCopy(template, {
    count: formatProjectOverviewPanelNumber(count, language),
  });
}

export function formatProjectOverviewPanelDate(value: string | undefined, language?: string | null): string {
  const copy = getProjectOverviewPanelCopy(language);

  if (!value) {
    return copy['projectOverview.date.unavailable'];
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return copy['projectOverview.date.unavailable'];
  }

  return new Intl.DateTimeFormat(resolveProjectOverviewPanelLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function mappedLabel(
  value: string | undefined,
  language: string | null | undefined,
  keys: Readonly<Record<string, ProjectOverviewPanelKey>>,
): string {
  const copy = getProjectOverviewPanelCopy(language);

  if (!value?.trim()) {
    return copy['projectOverview.value.unknown'];
  }

  const key = keys[value.trim().toLowerCase()];

  return key ? copy[key] : value;
}

export function projectOverviewSourceLabel(value?: string, language?: string | null): string {
  return mappedLabel(value, language, sourceKeys);
}

export function projectOverviewWorkspaceStatusLabel(value?: string, language?: string | null): string {
  return mappedLabel(value, language, workspaceStatusKeys);
}

export function projectOverviewCategoryLabel(value?: string, language?: string | null): string {
  return mappedLabel(value, language, categoryKeys);
}

export function projectOverviewRoleLabel(value?: string, language?: string | null): string {
  return mappedLabel(value, language, roleKeys);
}

export function projectOverviewMemberStatusLabel(value?: string, language?: string | null): string {
  return mappedLabel(value, language, memberStatusKeys);
}

export function projectOverviewActivityLabel(value?: string, language?: string | null): string {
  const copy = getProjectOverviewPanelCopy(language);

  if (!value?.trim()) {
    return copy['projectOverview.activity.default'];
  }

  const key = activityKeys[value.trim().toLowerCase()];

  if (key) {
    return copy[key];
  }

  return auditActionLabel(value, language);
}
