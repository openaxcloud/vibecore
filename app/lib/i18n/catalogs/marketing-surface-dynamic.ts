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
 *
 * `profile` et `profileNamed` RESTENT : `createProfileSurfacePage` n'est plus
 * morte depuis que `app/routes/profile.$username.tsx` l'appelle — cette route
 * est arrivée sur `main` APRÈS la base de cette proposition. Les trois autres
 * fabriques (`projectDatabase`, `team*`, `user`) n'ont, elles, toujours aucun
 * appelant.
 */
export type MarketingSurfaceDynamicKey = 'projectImport' | 'projectCompat' | 'profile' | 'profileNamed';
export type MarketingSurfaceDynamicDescriptor = Readonly<{
  key: MarketingSurfaceDynamicKey;
  values: Readonly<Record<string, string>>;
}>;
export interface MarketingSurfaceDynamicPageCopy {
  title: string;
  description: string;
  highlights: readonly string[];
  relatedRoutes?: readonly {
    label: string;
    to: string;
    description: string;
  }[];
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
  }
  throw new Error(`Unsupported dynamic marketing surface: ${descriptor.key}`);
}
