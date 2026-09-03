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
  'surfaceDynamic.projectPreview.title': 'Project Preview',
  'surfaceDynamic.projectPreview.description':
    'Preview route for project {projectId}, focused on visual QA, runtime readiness and shareable review.',
  'surfaceDynamic.projectPreview.highlight.visual': 'Visual QA',
  'surfaceDynamic.projectPreview.highlight.runtime': 'Runtime readiness',
  'surfaceDynamic.projectPreview.highlight.routes': 'Route checks',
  'surfaceDynamic.projectPreview.highlight.share': 'Shareable review',
  'surfaceDynamic.projectPreview.related.preview': 'Preview',
  'surfaceDynamic.projectPreview.related.previewDescription': 'Review platform preview behavior.',
  'surfaceDynamic.projectPreview.related.diagnostics': 'Runtime diagnostics',
  'surfaceDynamic.projectPreview.related.diagnosticsDescription': 'Inspect runtime blockers.',
  'surfaceDynamic.projectPreview.related.database': 'Project database',
  'surfaceDynamic.projectPreview.related.databaseDescription': 'Validate data-backed features.',
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
  'surfaceDynamic.editor.title': 'Editor Session',
  'surfaceDynamic.editor.description':
    'Editor compatibility route for session {editorId}, preserving the E-Code path into the E-Code IDE flow.',
  'surfaceDynamic.editor.highlight.files': 'File editor',
  'surfaceDynamic.editor.highlight.agent': 'Agent context',
  'surfaceDynamic.editor.highlight.preview': 'Preview panel',
  'surfaceDynamic.editor.highlight.session': 'Session continuity',
  'surfaceDynamic.editor.related.new': 'New editor session',
  'surfaceDynamic.editor.related.newDescription': 'Start a new editor route.',
  'surfaceDynamic.editor.related.projects': 'Projects',
  'surfaceDynamic.editor.related.projectsDescription': 'Open the canonical project workspace list.',
  'surfaceDynamic.editor.related.features': 'Features',
  'surfaceDynamic.editor.related.featuresDescription': 'Review the imported E-Code IDE capabilities.',
  'surfaceDynamic.team.related.all': 'All teams',
  'surfaceDynamic.team.related.allDescription': 'Return to the imported teams route.',
  'surfaceDynamic.team.related.create': 'Create team',
  'surfaceDynamic.team.related.createDescription': 'Start a new team workspace.',
  'surfaceDynamic.team.related.collaboration': 'Collaboration',
  'surfaceDynamic.team.related.collaborationDescription': 'Review multiplayer team behavior.',
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
  'surfaceDynamic.projectPreview.title': 'Aperçu du projet',
  'surfaceDynamic.projectPreview.description':
    'Route d’aperçu du projet {projectId}, centrée sur l’assurance qualité visuelle, l’état de l’environnement d’exécution et la revue partageable.',
  'surfaceDynamic.projectPreview.highlight.visual': 'Assurance qualité visuelle',
  'surfaceDynamic.projectPreview.highlight.runtime': 'État de l’environnement d’exécution',
  'surfaceDynamic.projectPreview.highlight.routes': 'Contrôles des routes',
  'surfaceDynamic.projectPreview.highlight.share': 'Revue partageable',
  'surfaceDynamic.projectPreview.related.preview': 'Aperçu',
  'surfaceDynamic.projectPreview.related.previewDescription': 'Consultez le fonctionnement de l’aperçu.',
  'surfaceDynamic.projectPreview.related.diagnostics': 'Diagnostic de l’environnement d’exécution',
  'surfaceDynamic.projectPreview.related.diagnosticsDescription':
    'Identifiez les blocages de l’environnement d’exécution.',
  'surfaceDynamic.projectPreview.related.database': 'Base de données du projet',
  'surfaceDynamic.projectPreview.related.databaseDescription': 'Validez les fonctionnalités adossées aux données.',
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
  'surfaceDynamic.editor.title': 'Session de l’éditeur',
  'surfaceDynamic.editor.description':
    'Route de compatibilité de la session {editorId}, qui préserve le parcours E-Code vers l’IDE.',
  'surfaceDynamic.editor.highlight.files': 'Éditeur de fichiers',
  'surfaceDynamic.editor.highlight.agent': 'Contexte de l’agent',
  'surfaceDynamic.editor.highlight.preview': 'Panneau d’aperçu',
  'surfaceDynamic.editor.highlight.session': 'Continuité de la session',
  'surfaceDynamic.editor.related.new': 'Nouvelle session de l’éditeur',
  'surfaceDynamic.editor.related.newDescription': 'Démarrez une nouvelle route d’édition.',
  'surfaceDynamic.editor.related.projects': 'Projets',
  'surfaceDynamic.editor.related.projectsDescription': 'Ouvrez la liste principale des espaces de travail.',
  'surfaceDynamic.editor.related.features': 'Fonctionnalités',
  'surfaceDynamic.editor.related.featuresDescription': 'Découvrez les fonctionnalités de l’IDE E-Code.',
  'surfaceDynamic.team.related.all': 'Toutes les équipes',
  'surfaceDynamic.team.related.allDescription': 'Revenez à la route des équipes.',
  'surfaceDynamic.team.related.create': 'Créer une équipe',
  'surfaceDynamic.team.related.createDescription': 'Créez un nouvel espace de travail d’équipe.',
  'surfaceDynamic.team.related.collaboration': 'Collaboration',
  'surfaceDynamic.team.related.collaborationDescription': 'Découvrez le fonctionnement collaboratif.',
} as const satisfies Record<keyof typeof marketingSurfaceDynamicEn, string>;

/*
 * Une clé n'existe ici que si une fabrique de `EcodeSurfacePages` la passe à
 * `makeDynamicSurfacePage` — c'est le SEUL appelant, vérifié. Retirer un membre
 * de cette union rend donc la suppression d'une fabrique vérifiable par le
 * compilateur au lieu de la laisser pourrir en copie morte.
 */
export type MarketingSurfaceDynamicKey = 'projectImport' | 'projectPreview' | 'projectCompat' | 'editor';

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
    case 'projectPreview':
      return {
        title: t('surfaceDynamic.projectPreview.title', values),
        description: t('surfaceDynamic.projectPreview.description', values),
        highlights: [
          t('surfaceDynamic.projectPreview.highlight.visual', values),
          t('surfaceDynamic.projectPreview.highlight.runtime', values),
          t('surfaceDynamic.projectPreview.highlight.routes', values),
          t('surfaceDynamic.projectPreview.highlight.share', values),
        ],
        relatedRoutes: [
          {
            label: t('surfaceDynamic.projectPreview.related.preview', values),
            to: '/preview',
            description: t('surfaceDynamic.projectPreview.related.previewDescription', values),
          },
          {
            label: t('surfaceDynamic.projectPreview.related.diagnostics', values),
            to: '/runtime-diagnostics',
            description: t('surfaceDynamic.projectPreview.related.diagnosticsDescription', values),
          },
          {
            label: t('surfaceDynamic.projectPreview.related.database', values),
            to: `/projects/${projectId}/database`,
            description: t('surfaceDynamic.projectPreview.related.databaseDescription', values),
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
    case 'editor':
      return {
        title: t('surfaceDynamic.editor.title', values),
        description: t('surfaceDynamic.editor.description', values),
        highlights: [
          t('surfaceDynamic.editor.highlight.files', values),
          t('surfaceDynamic.editor.highlight.agent', values),
          t('surfaceDynamic.editor.highlight.preview', values),
          t('surfaceDynamic.editor.highlight.session', values),
        ],
        relatedRoutes: [
          {
            label: t('surfaceDynamic.editor.related.new', values),
            to: '/editor/new',
            description: t('surfaceDynamic.editor.related.newDescription', values),
          },
          {
            label: t('surfaceDynamic.editor.related.projects', values),
            to: '/projects',
            description: t('surfaceDynamic.editor.related.projectsDescription', values),
          },
          {
            label: t('surfaceDynamic.editor.related.features', values),
            to: '/features',
            description: t('surfaceDynamic.editor.related.featuresDescription', values),
          },
        ],
      };
  }

  throw new Error(`Unsupported dynamic marketing surface: ${descriptor.key}`);
}
