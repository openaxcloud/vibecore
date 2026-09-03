import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export const marketingSurfaceDynamicEn = {
  'surfaceDynamic.importSource.figma': 'Figma',
  'surfaceDynamic.importSource.bolt': 'Legacy export',
  'surfaceDynamic.importSource.lovable': 'Lovable',
  'surfaceDynamic.projectImport.title': '{sourceLabel} Project Import',
  'surfaceDynamic.projectImport.description':
    'Import {sourceLabel} work into project {projectId} with asset mapping, route planning and validation checks.',
  'surfaceDynamic.projectImport.highlight.source': '{sourceLabel} source mapping',
  'surfaceDynamic.projectImport.highlight.context': 'Project context',
  'surfaceDynamic.projectImport.highlight.dependencies': 'Dependency planning',
  'surfaceDynamic.projectImport.highlight.preview': 'Preview validation',
  'surfaceDynamic.projectImport.related.github': 'GitHub import',
  'surfaceDynamic.projectImport.related.githubDescription': 'Import repository-backed projects.',
  'surfaceDynamic.projectImport.related.overview': 'Project overview',
  'surfaceDynamic.projectImport.related.overviewDescription': 'Return to the project workspace.',
  'surfaceDynamic.projectImport.related.preview': 'Preview',
  'surfaceDynamic.projectImport.related.previewDescription': 'Validate the imported app visually.',
  'surfaceDynamic.projectDatabase.title': 'Project Database',
  'surfaceDynamic.projectDatabase.description':
    'Project {projectId} database planning for schemas, migrations, seed data and safe runtime configuration.',
  'surfaceDynamic.projectDatabase.highlight.schema': 'Project schema',
  'surfaceDynamic.projectDatabase.highlight.migrations': 'Migrations',
  'surfaceDynamic.projectDatabase.highlight.seed': 'Seed data',
  'surfaceDynamic.projectDatabase.highlight.variables': 'Runtime variables',
  'surfaceDynamic.projectDatabase.related.database': 'Database',
  'surfaceDynamic.projectDatabase.related.databaseDescription': 'Review platform database guidance.',
  'surfaceDynamic.projectDatabase.related.secrets': 'Secrets',
  'surfaceDynamic.projectDatabase.related.secretsDescription': 'Store database credentials safely.',
  'surfaceDynamic.projectDatabase.related.preview': 'Project preview',
  'surfaceDynamic.projectDatabase.related.previewDescription': 'Validate database-backed UI.',
  'surfaceDynamic.projectCompat.title': 'Project Compatibility Overview',
  'surfaceDynamic.projectCompat.description':
    'Compatibility route for legacy E-Code project {projectId}, with links into the E-Code project workspace.',
  'surfaceDynamic.projectCompat.highlight.legacy': 'Legacy route support',
  'surfaceDynamic.projectCompat.highlight.overview': 'Project overview',
  'surfaceDynamic.projectCompat.highlight.workspace': 'Workspace links',
  'surfaceDynamic.projectCompat.highlight.preview': 'Preview handoff',
  'surfaceDynamic.projectCompat.related.projects': 'Projects',
  'surfaceDynamic.projectCompat.related.projectsDescription': 'Open the E-Code project list.',
  'surfaceDynamic.projectCompat.related.workspace': 'Project workspace',
  'surfaceDynamic.projectCompat.related.workspaceDescription': 'Open the canonical project route.',
  'surfaceDynamic.projectCompat.related.editor': 'Editor',
  'surfaceDynamic.projectCompat.related.editorDescription': 'Use the imported editor compatibility route.',
  'surfaceDynamic.teamSettings.title': 'Team Settings',
  'surfaceDynamic.teamSettings.description':
    'Settings route for team {teamId}, including identity, members, billing context and project access.',
  'surfaceDynamic.teamSettings.highlight.members': 'Member policy',
  'surfaceDynamic.teamSettings.highlight.billing': 'Billing ownership',
  'surfaceDynamic.teamSettings.highlight.access': 'Project access',
  'surfaceDynamic.teamSettings.highlight.audit': 'Audit context',
  'surfaceDynamic.teamWorkspace.title': 'Team Workspace',
  'surfaceDynamic.teamWorkspace.description':
    'Team route for {teamId}, connecting members, shared projects, roles and review workflows.',
  'surfaceDynamic.teamWorkspace.highlight.members': 'Members',
  'surfaceDynamic.teamWorkspace.highlight.projects': 'Shared projects',
  'surfaceDynamic.teamWorkspace.highlight.roles': 'Roles',
  'surfaceDynamic.teamWorkspace.highlight.review': 'Review workflows',
  'surfaceDynamic.team.related.all': 'All teams',
  'surfaceDynamic.team.related.allDescription': 'Return to the imported teams route.',
  'surfaceDynamic.team.related.create': 'Create team',
  'surfaceDynamic.team.related.createDescription': 'Start a new team workspace.',
  'surfaceDynamic.team.related.collaboration': 'Collaboration',
  'surfaceDynamic.team.related.collaborationDescription': 'Review multiplayer team behavior.',
  'surfaceDynamic.profile.title': 'Profile',
  'surfaceDynamic.profile.description':
    'A profile route for builder identity, shared projects, community presence and account discovery.',
  'surfaceDynamic.profileNamed.title': '{username} Profile',
  'surfaceDynamic.profileNamed.description':
    'Public E-Code profile route for {username}, including builder identity, shared work and community context.',
  'surfaceDynamic.profile.highlight.identity': 'Builder identity',
  'surfaceDynamic.profile.highlight.projects': 'Shared projects',
  'surfaceDynamic.profile.highlight.community': 'Community presence',
  'surfaceDynamic.profile.highlight.public': 'Public route support',
  'surfaceDynamic.user.title': '{username} User Profile',
  'surfaceDynamic.user.description':
    'Legacy E-Code user route for {username}, mapped into a real E-Code profile-compatible surface.',
  'surfaceDynamic.user.highlight.legacy': 'Legacy user route',
  'surfaceDynamic.user.highlight.profile': 'Profile context',
  'surfaceDynamic.user.highlight.projects': 'Shared projects',
  'surfaceDynamic.user.highlight.community': 'Community identity',
  'surfaceDynamic.user.related.profile': 'Profile',
  'surfaceDynamic.user.related.profileDescription': 'Open the equivalent profile route.',
  'surfaceDynamic.user.related.settings': 'User settings',
  'surfaceDynamic.user.related.settingsDescription': 'Manage user-level preferences.',
  'surfaceDynamic.user.related.community': 'Community',
  'surfaceDynamic.user.related.communityDescription': 'Browse community routes.',
} as const;

export const marketingSurfaceDynamicFr = {
  'surfaceDynamic.importSource.figma': 'Figma',
  'surfaceDynamic.importSource.bolt': 'Export historique',
  'surfaceDynamic.importSource.lovable': 'Lovable',
  'surfaceDynamic.projectImport.title': 'Importation de projet {sourceLabel}',
  'surfaceDynamic.projectImport.description':
    'Importez le travail {sourceLabel} dans le projet {projectId}, avec correspondance des ressources, planification des routes et contrôles de validation.',
  'surfaceDynamic.projectImport.highlight.source': 'Correspondance de la source {sourceLabel}',
  'surfaceDynamic.projectImport.highlight.context': 'Contexte du projet',
  'surfaceDynamic.projectImport.highlight.dependencies': 'Planification des dépendances',
  'surfaceDynamic.projectImport.highlight.preview': 'Validation de l’aperçu',
  'surfaceDynamic.projectImport.related.github': 'Import GitHub',
  'surfaceDynamic.projectImport.related.githubDescription': 'Importez des projets adossés à un dépôt.',
  'surfaceDynamic.projectImport.related.overview': 'Vue d’ensemble du projet',
  'surfaceDynamic.projectImport.related.overviewDescription': 'Revenez à l’espace de travail du projet.',
  'surfaceDynamic.projectImport.related.preview': 'Aperçu',
  'surfaceDynamic.projectImport.related.previewDescription': 'Validez visuellement l’application importée.',
  'surfaceDynamic.projectDatabase.title': 'Base de données du projet',
  'surfaceDynamic.projectDatabase.description':
    'Planifiez la base de données du projet {projectId} : schémas, migrations, données initiales et configuration sûre de l’environnement d’exécution.',
  'surfaceDynamic.projectDatabase.highlight.schema': 'Schéma du projet',
  'surfaceDynamic.projectDatabase.highlight.migrations': 'Migrations',
  'surfaceDynamic.projectDatabase.highlight.seed': 'Données initiales',
  'surfaceDynamic.projectDatabase.highlight.variables': 'Variables de l’environnement d’exécution',
  'surfaceDynamic.projectDatabase.related.database': 'Base de données',
  'surfaceDynamic.projectDatabase.related.databaseDescription': 'Consultez le guide de la base de données.',
  'surfaceDynamic.projectDatabase.related.secrets': 'Secrets',
  'surfaceDynamic.projectDatabase.related.secretsDescription':
    'Stockez les identifiants de base de données en sécurité.',
  'surfaceDynamic.projectDatabase.related.preview': 'Aperçu du projet',
  'surfaceDynamic.projectDatabase.related.previewDescription': 'Validez l’interface adossée à la base de données.',
  'surfaceDynamic.projectCompat.title': 'Vue de compatibilité du projet',
  'surfaceDynamic.projectCompat.description':
    'Route de compatibilité de l’ancien projet E-Code {projectId}, avec des liens vers l’espace de travail E-Code.',
  'surfaceDynamic.projectCompat.highlight.legacy': 'Prise en charge de l’ancienne route',
  'surfaceDynamic.projectCompat.highlight.overview': 'Vue d’ensemble du projet',
  'surfaceDynamic.projectCompat.highlight.workspace': 'Liens vers l’espace de travail',
  'surfaceDynamic.projectCompat.highlight.preview': 'Passage vers l’aperçu',
  'surfaceDynamic.projectCompat.related.projects': 'Projets',
  'surfaceDynamic.projectCompat.related.projectsDescription': 'Ouvrez la liste des projets E-Code.',
  'surfaceDynamic.projectCompat.related.workspace': 'Espace de travail du projet',
  'surfaceDynamic.projectCompat.related.workspaceDescription': 'Ouvrez la route principale du projet.',
  'surfaceDynamic.projectCompat.related.editor': 'Éditeur',
  'surfaceDynamic.projectCompat.related.editorDescription': 'Utilisez la route de compatibilité de l’éditeur.',
  'surfaceDynamic.teamSettings.title': 'Paramètres de l’équipe',
  'surfaceDynamic.teamSettings.description':
    'Paramètres de l’équipe {teamId} : identité, membres, facturation et accès aux projets.',
  'surfaceDynamic.teamSettings.highlight.members': 'Politique des membres',
  'surfaceDynamic.teamSettings.highlight.billing': 'Responsabilité de facturation',
  'surfaceDynamic.teamSettings.highlight.access': 'Accès aux projets',
  'surfaceDynamic.teamSettings.highlight.audit': 'Contexte d’audit',
  'surfaceDynamic.teamWorkspace.title': 'Espace de travail de l’équipe',
  'surfaceDynamic.teamWorkspace.description':
    'Route de l’équipe {teamId}, qui réunit les membres, projets partagés, rôles et flux de revue.',
  'surfaceDynamic.teamWorkspace.highlight.members': 'Membres',
  'surfaceDynamic.teamWorkspace.highlight.projects': 'Projets partagés',
  'surfaceDynamic.teamWorkspace.highlight.roles': 'Rôles',
  'surfaceDynamic.teamWorkspace.highlight.review': 'Flux de revue',
  'surfaceDynamic.team.related.all': 'Toutes les équipes',
  'surfaceDynamic.team.related.allDescription': 'Revenez à la route des équipes.',
  'surfaceDynamic.team.related.create': 'Créer une équipe',
  'surfaceDynamic.team.related.createDescription': 'Créez un nouvel espace de travail d’équipe.',
  'surfaceDynamic.team.related.collaboration': 'Collaboration',
  'surfaceDynamic.team.related.collaborationDescription': 'Découvrez le fonctionnement collaboratif.',
  'surfaceDynamic.profile.title': 'Profil',
  'surfaceDynamic.profile.description':
    'Une page consacrée à l’identité du créateur, aux projets partagés, à sa présence dans la communauté et à la découverte de son compte.',
  'surfaceDynamic.profileNamed.title': 'Profil de {username}',
  'surfaceDynamic.profileNamed.description':
    'Profil E-Code public de {username}, avec son identité, ses travaux partagés et son contexte communautaire.',
  'surfaceDynamic.profile.highlight.identity': 'Identité du créateur',
  'surfaceDynamic.profile.highlight.projects': 'Projets partagés',
  'surfaceDynamic.profile.highlight.community': 'Présence dans la communauté',
  'surfaceDynamic.profile.highlight.public': 'Prise en charge de la route publique',
  'surfaceDynamic.user.title': 'Profil utilisateur de {username}',
  'surfaceDynamic.user.description':
    'Ancienne route utilisateur E-Code de {username}, reliée à une véritable page compatible avec les profils E-Code.',
  'surfaceDynamic.user.highlight.legacy': 'Ancienne route utilisateur',
  'surfaceDynamic.user.highlight.profile': 'Contexte du profil',
  'surfaceDynamic.user.highlight.projects': 'Projets partagés',
  'surfaceDynamic.user.highlight.community': 'Identité communautaire',
  'surfaceDynamic.user.related.profile': 'Profil',
  'surfaceDynamic.user.related.profileDescription': 'Ouvrez la page de profil équivalente.',
  'surfaceDynamic.user.related.settings': 'Paramètres utilisateur',
  'surfaceDynamic.user.related.settingsDescription': 'Gérez les préférences de l’utilisateur.',
  'surfaceDynamic.user.related.community': 'Communauté',
  'surfaceDynamic.user.related.communityDescription': 'Parcourez les pages de la communauté.',
} as const satisfies Record<keyof typeof marketingSurfaceDynamicEn, string>;

export type MarketingSurfaceDynamicKey =
  | 'projectImport'
  | 'projectDatabase'
  | 'projectCompat'
  | 'teamSettings'
  | 'teamWorkspace'
  | 'profile'
  | 'profileNamed'
  | 'user';

export type MarketingSurfaceDynamicDescriptor = Readonly<{
  key: MarketingSurfaceDynamicKey;
  values: Readonly<Record<string, string>>;
}>;

export interface MarketingSurfaceDynamicPageCopy {
  title: string;
  description: string;
  highlights: readonly string[];
  relatedRoutes?: readonly { label: string; to: string; description: string }[];
}

type CopyKey = keyof typeof marketingSurfaceDynamicEn;

function interpolate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (token, key: string) => values[key] ?? token);
}

function createTranslator(language?: string | null) {
  const catalog = resolveMarketingLanguage(language) === 'fr' ? marketingSurfaceDynamicFr : marketingSurfaceDynamicEn;

  return (key: CopyKey, values: Readonly<Record<string, string>>) => interpolate(catalog[key], values);
}

export function getMarketingImportSourceLabel(language: string | null | undefined, source: string): string | undefined {
  if (source !== 'figma' && source !== 'bolt' && source !== 'lovable') {
    return undefined;
  }

  return createTranslator(language)(`surfaceDynamic.importSource.${source}`, {});
}

export function getMarketingSurfaceDynamicPageCopy(
  language: MarketingLanguage | string | null | undefined,
  descriptor: MarketingSurfaceDynamicDescriptor,
): MarketingSurfaceDynamicPageCopy {
  const t = createTranslator(language);
  const values = descriptor.values;
  const projectId = values.projectId ?? '';
  const username = values.username ?? '';
  const source = values.source ?? '';
  const sourceLabel = getMarketingImportSourceLabel(language, source) ?? source;
  const withSource = { ...values, sourceLabel };

  switch (descriptor.key) {
    case 'projectImport':
      return {
        title: t('surfaceDynamic.projectImport.title', withSource),
        description: t('surfaceDynamic.projectImport.description', withSource),
        highlights: [
          t('surfaceDynamic.projectImport.highlight.source', withSource),
          t('surfaceDynamic.projectImport.highlight.context', values),
          t('surfaceDynamic.projectImport.highlight.dependencies', values),
          t('surfaceDynamic.projectImport.highlight.preview', values),
        ],
        relatedRoutes: [
          {
            label: t('surfaceDynamic.projectImport.related.github', values),
            to: '/import-github',
            description: t('surfaceDynamic.projectImport.related.githubDescription', values),
          },
          {
            label: t('surfaceDynamic.projectImport.related.overview', values),
            to: `/projects/${projectId}`,
            description: t('surfaceDynamic.projectImport.related.overviewDescription', values),
          },
          {
            label: t('surfaceDynamic.projectImport.related.preview', values),
            to: `/projects/${projectId}/preview`,
            description: t('surfaceDynamic.projectImport.related.previewDescription', values),
          },
        ],
      };
    case 'projectDatabase':
      return {
        title: t('surfaceDynamic.projectDatabase.title', values),
        description: t('surfaceDynamic.projectDatabase.description', values),
        highlights: [
          t('surfaceDynamic.projectDatabase.highlight.schema', values),
          t('surfaceDynamic.projectDatabase.highlight.migrations', values),
          t('surfaceDynamic.projectDatabase.highlight.seed', values),
          t('surfaceDynamic.projectDatabase.highlight.variables', values),
        ],
        relatedRoutes: [
          {
            label: t('surfaceDynamic.projectDatabase.related.database', values),
            to: '/database',
            description: t('surfaceDynamic.projectDatabase.related.databaseDescription', values),
          },
          {
            label: t('surfaceDynamic.projectDatabase.related.secrets', values),
            to: '/secrets',
            description: t('surfaceDynamic.projectDatabase.related.secretsDescription', values),
          },
          {
            label: t('surfaceDynamic.projectDatabase.related.preview', values),
            to: `/projects/${projectId}/preview`,
            description: t('surfaceDynamic.projectDatabase.related.previewDescription', values),
          },
        ],
      };
    case 'projectCompat':
      return {
        title: t('surfaceDynamic.projectCompat.title', values),
        description: t('surfaceDynamic.projectCompat.description', values),
        highlights: [
          t('surfaceDynamic.projectCompat.highlight.legacy', values),
          t('surfaceDynamic.projectCompat.highlight.overview', values),
          t('surfaceDynamic.projectCompat.highlight.workspace', values),
          t('surfaceDynamic.projectCompat.highlight.preview', values),
        ],
        relatedRoutes: [
          {
            label: t('surfaceDynamic.projectCompat.related.projects', values),
            to: '/projects',
            description: t('surfaceDynamic.projectCompat.related.projectsDescription', values),
          },
          {
            label: t('surfaceDynamic.projectCompat.related.workspace', values),
            to: `/projects/${projectId}`,
            description: t('surfaceDynamic.projectCompat.related.workspaceDescription', values),
          },
          {
            label: t('surfaceDynamic.projectCompat.related.editor', values),
            to: `/editor/${projectId}`,
            description: t('surfaceDynamic.projectCompat.related.editorDescription', values),
          },
        ],
      };
    case 'teamSettings':
    case 'teamWorkspace': {
      const prefix = descriptor.key === 'teamSettings' ? 'surfaceDynamic.teamSettings' : 'surfaceDynamic.teamWorkspace';

      return {
        title: t(`${prefix}.title`, values),
        description: t(`${prefix}.description`, values),
        highlights:
          descriptor.key === 'teamSettings'
            ? (['members', 'billing', 'access', 'audit'] as const).map((item) =>
                t(`surfaceDynamic.teamSettings.highlight.${item}`, values),
              )
            : (['members', 'projects', 'roles', 'review'] as const).map((item) =>
                t(`surfaceDynamic.teamWorkspace.highlight.${item}`, values),
              ),
        relatedRoutes: [
          {
            label: t('surfaceDynamic.team.related.all', values),
            to: '/teams',
            description: t('surfaceDynamic.team.related.allDescription', values),
          },
          {
            label: t('surfaceDynamic.team.related.create', values),
            to: '/teams/new',
            description: t('surfaceDynamic.team.related.createDescription', values),
          },
          {
            label: t('surfaceDynamic.team.related.collaboration', values),
            to: '/collaboration',
            description: t('surfaceDynamic.team.related.collaborationDescription', values),
          },
        ],
      };
    }
    case 'profile':
    case 'profileNamed': {
      const prefix = descriptor.key === 'profile' ? 'surfaceDynamic.profile' : 'surfaceDynamic.profileNamed';

      return {
        title: t(`${prefix}.title`, values),
        description: t(`${prefix}.description`, values),
        highlights: [
          t('surfaceDynamic.profile.highlight.identity', values),
          t('surfaceDynamic.profile.highlight.projects', values),
          t('surfaceDynamic.profile.highlight.community', values),
          t('surfaceDynamic.profile.highlight.public', values),
        ],
      };
    }
    case 'user':
      return {
        title: t('surfaceDynamic.user.title', values),
        description: t('surfaceDynamic.user.description', values),
        highlights: [
          t('surfaceDynamic.user.highlight.legacy', values),
          t('surfaceDynamic.user.highlight.profile', values),
          t('surfaceDynamic.user.highlight.projects', values),
          t('surfaceDynamic.user.highlight.community', values),
        ],
        relatedRoutes: [
          {
            label: t('surfaceDynamic.user.related.profile', values),
            to: `/profile/${username}`,
            description: t('surfaceDynamic.user.related.profileDescription', values),
          },
          {
            label: t('surfaceDynamic.user.related.settings', values),
            to: '/user/settings',
            description: t('surfaceDynamic.user.related.settingsDescription', values),
          },
          {
            label: t('surfaceDynamic.user.related.community', values),
            to: '/community',
            description: t('surfaceDynamic.user.related.communityDescription', values),
          },
        ],
      };
  }

  throw new Error(`Unsupported dynamic marketing surface: ${descriptor.key}`);
}
