import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const compatibilityRoutesEn = {
  'mobileWorkspace.seo.title': 'Mobile workspace — E-Code',
  'mobileWorkspace.seo.description':
    'Open an E-Code project from a mobile-ready route with access to the agent, files, preview, and runtime status.',
  'mobileWorkspace.seo.imageAlt': 'E-Code mobile workspace',
  'mobileWorkspace.page.title': 'Mobile workspace',
  'mobileWorkspace.page.eyebrow': 'Mobile IDE',
  'mobileWorkspace.page.description':
    'Open the same E-Code project context from a mobile-ready route with the agent, files, preview, and runtime status available through the canonical IDE.',
  'mobileWorkspace.page.primaryAction': 'Open project IDE',
  'mobileWorkspace.page.secondaryAction': 'Mobile overview',
  'mobileWorkspace.highlight.phoneWorkflow': 'Phone workflow',
  'mobileWorkspace.highlight.projectContext': 'Project context',
  'mobileWorkspace.highlight.agentPanel': 'Agent panel',
  'mobileWorkspace.highlight.previewAccess': 'Preview access',
  'mobileWorkspace.section.continue.title': 'Continue on mobile',
  'mobileWorkspace.section.continue.body':
    'Return to your project with the same files, agent conversation, and workspace status available on your other devices.',
  'mobileWorkspace.section.continue.projectContext': 'Project context',
  'mobileWorkspace.section.continue.mobileNavigation': 'Mobile navigation',
  'mobileWorkspace.section.continue.agentWorkflow': 'Agent workflow',
  'mobileWorkspace.section.continue.previewAccess': 'Preview access',
  'mobileWorkspace.section.security.title': 'Secure project access',
  'mobileWorkspace.section.security.body':
    'Sign-in, project permissions, and team policies stay active when you move between desktop, tablet, and mobile.',
  'mobileWorkspace.section.security.authenticatedAccess': 'Authenticated access',
  'mobileWorkspace.section.security.projectPermissions': 'Project permissions',
  'mobileWorkspace.section.security.workspaceControls': 'Workspace controls',
  'mobileWorkspace.section.security.teamGovernance': 'Team governance',
  'ideCompatibility.seo.title': 'IDE project {projectId} — E-Code',
  'ideCompatibility.seo.description':
    'Open E-Code IDE project {projectId} through the compatibility route and continue in the canonical project workspace.',
  'ideCompatibility.seo.imageAlt': 'E-Code IDE project {projectId}',
  'ideCompatibility.page.title': 'Open IDE project {projectId}',
  'ideCompatibility.page.eyebrow': 'IDE compatibility',
  'ideCompatibility.page.description':
    'This E-Code compatibility route preserves /ide/:id links while directing you to the canonical E-Code project IDE.',
  'ideCompatibility.page.primaryAction': 'Open canonical IDE',
  'ideCompatibility.page.secondaryAction': 'Projects',
  'ideCompatibility.highlight.canonicalRoute': 'Canonical route',
  'ideCompatibility.highlight.idePreserved': 'E-Code IDE preserved',
  'ideCompatibility.highlight.runtimePanels': 'Runtime panels',
  'ideCompatibility.highlight.teamControls': 'Team controls',
  'ideCompatibility.section.behavior.title': 'Compatibility behavior',
  'ideCompatibility.section.behavior.body':
    'Existing /ide/:id links remain valid and guide you to the project route where loaders, permissions, and runtime state are enforced.',
  'ideCompatibility.section.behavior.projectLoader': 'Project loader',
  'ideCompatibility.section.behavior.authenticatedAccess': 'Authenticated access',
  'ideCompatibility.section.behavior.runtimeState': 'Runtime state',
  'ideCompatibility.section.boundary.title': 'Production boundary',
  'ideCompatibility.section.boundary.body':
    'The actual IDE surface remains the preserved E-Code workspace rather than a duplicate implementation.',
  'ideCompatibility.section.boundary.noDuplicate': 'No duplicate IDE',
  'ideCompatibility.section.boundary.sharedModel': 'Shared project model',
  'ideCompatibility.section.boundary.existingPanels': 'Existing panels',
  'ideCompatibility.section.boundary.deploymentControls': 'Deployment controls',
} as const;

export type CompatibilityRoutesKey = keyof typeof compatibilityRoutesEn;
export type CompatibilityRoutesCopy = Readonly<Record<CompatibilityRoutesKey, string>>;

export const compatibilityRoutesFr: CompatibilityRoutesCopy = {
  'mobileWorkspace.seo.title': 'Espace de travail mobile — E-Code',
  'mobileWorkspace.seo.description':
    'Ouvrez un projet E-Code depuis une route adaptée aux mobiles, avec accès à l’agent, aux fichiers, à l’aperçu et à l’état de l’environnement d’exécution.',
  'mobileWorkspace.seo.imageAlt': 'Espace de travail mobile E-Code',
  'mobileWorkspace.page.title': 'Espace de travail mobile',
  'mobileWorkspace.page.eyebrow': 'IDE mobile',
  'mobileWorkspace.page.description':
    'Ouvrez le même contexte de projet E-Code depuis une route adaptée aux mobiles, avec l’agent, les fichiers, l’aperçu et l’état de l’environnement d’exécution disponibles dans l’IDE canonique.',
  'mobileWorkspace.page.primaryAction': 'Ouvrir l’IDE du projet',
  'mobileWorkspace.page.secondaryAction': 'Vue d’ensemble mobile',
  'mobileWorkspace.highlight.phoneWorkflow': 'Parcours sur téléphone',
  'mobileWorkspace.highlight.projectContext': 'Contexte du projet',
  'mobileWorkspace.highlight.agentPanel': 'Panneau de l’agent',
  'mobileWorkspace.highlight.previewAccess': 'Accès à l’aperçu',
  'mobileWorkspace.section.continue.title': 'Poursuivre sur mobile',
  'mobileWorkspace.section.continue.body':
    'Retrouvez votre projet avec les mêmes fichiers, la conversation de l’agent et l’état de l’espace de travail que sur vos autres appareils.',
  'mobileWorkspace.section.continue.projectContext': 'Contexte du projet',
  'mobileWorkspace.section.continue.mobileNavigation': 'Navigation mobile',
  'mobileWorkspace.section.continue.agentWorkflow': 'Parcours avec l’agent',
  'mobileWorkspace.section.continue.previewAccess': 'Accès à l’aperçu',
  'mobileWorkspace.section.security.title': 'Accès sécurisé au projet',
  'mobileWorkspace.section.security.body':
    'La connexion, les autorisations du projet et les politiques de l’équipe restent actives lorsque vous passez d’un ordinateur à une tablette ou à un mobile.',
  'mobileWorkspace.section.security.authenticatedAccess': 'Accès authentifié',
  'mobileWorkspace.section.security.projectPermissions': 'Autorisations du projet',
  'mobileWorkspace.section.security.workspaceControls': 'Contrôles de l’espace de travail',
  'mobileWorkspace.section.security.teamGovernance': 'Gouvernance de l’équipe',
  'ideCompatibility.seo.title': 'Projet {projectId} dans l’IDE — E-Code',
  'ideCompatibility.seo.description':
    'Ouvrez le projet {projectId} dans l’IDE E-Code depuis la route de compatibilité, puis poursuivez dans l’espace de travail canonique du projet.',
  'ideCompatibility.seo.imageAlt': 'Projet {projectId} dans l’IDE E-Code',
  'ideCompatibility.page.title': 'Ouvrir le projet {projectId} dans l’IDE',
  'ideCompatibility.page.eyebrow': 'Compatibilité de l’IDE',
  'ideCompatibility.page.description':
    'Cette route de compatibilité E-Code préserve les liens /ide/:id et vous dirige vers l’IDE canonique du projet E-Code.',
  'ideCompatibility.page.primaryAction': 'Ouvrir l’IDE canonique',
  'ideCompatibility.page.secondaryAction': 'Projets',
  'ideCompatibility.highlight.canonicalRoute': 'Route canonique',
  'ideCompatibility.highlight.idePreserved': 'IDE E-Code préservé',
  'ideCompatibility.highlight.runtimePanels': 'Panneaux de l’environnement d’exécution',
  'ideCompatibility.highlight.teamControls': 'Contrôles de l’équipe',
  'ideCompatibility.section.behavior.title': 'Fonctionnement de la compatibilité',
  'ideCompatibility.section.behavior.body':
    'Les liens /ide/:id existants restent valides et vous dirigent vers la route du projet, où les loaders, les autorisations et l’état de l’environnement d’exécution sont appliqués.',
  'ideCompatibility.section.behavior.projectLoader': 'Loader du projet',
  'ideCompatibility.section.behavior.authenticatedAccess': 'Accès authentifié',
  'ideCompatibility.section.behavior.runtimeState': 'État de l’environnement d’exécution',
  'ideCompatibility.section.boundary.title': 'Périmètre de production',
  'ideCompatibility.section.boundary.body':
    'La véritable surface de l’IDE reste l’espace de travail E-Code préservé, et non une implémentation dupliquée.',
  'ideCompatibility.section.boundary.noDuplicate': 'Aucun IDE dupliqué',
  'ideCompatibility.section.boundary.sharedModel': 'Modèle de projet partagé',
  'ideCompatibility.section.boundary.existingPanels': 'Panneaux existants',
  'ideCompatibility.section.boundary.deploymentControls': 'Contrôles de déploiement',
};

export function resolveCompatibilityRouteLanguage(language?: string | null): 'en' | 'fr' {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

export function getCompatibilityRoutesCopy(language?: string | null): CompatibilityRoutesCopy {
  return resolveCompatibilityRouteLanguage(language) === 'fr' ? compatibilityRoutesFr : compatibilityRoutesEn;
}

export function formatCompatibilityRouteCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
