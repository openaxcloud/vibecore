import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const ideNewRouteEn = {
  'ideNew.seo.title': 'Create a new IDE project — E-Code',
  'ideNew.seo.description':
    'Create a new E-Code project from a prompt, a template, or a repository, then continue in the full E-Code IDE.',
  'ideNew.seo.imageAlt': 'Create a new project in the E-Code IDE',
  'ideNew.page.title': 'Create a new IDE project',
  'ideNew.page.eyebrow': 'IDE',
  'ideNew.page.description':
    'The original E-Code /ide/new route remains available and directs builders to project creation without replacing the E-Code IDE.',
  'ideNew.page.primaryAction': 'Create a project',
  'ideNew.page.secondaryAction': 'Browse templates',
  'ideNew.highlight.projectCreation': 'Project creation',
  'ideNew.highlight.ide': 'E-Code IDE',
  'ideNew.highlight.templates': 'Templates',
  'ideNew.highlight.runtimeSetup': 'Runtime setup',
  'ideNew.section.start.title': 'Create from a prompt or template',
  'ideNew.section.start.body':
    'Start with a natural-language prompt, import a repository, or choose a template, then open the project in the IDE.',
  'ideNew.section.start.prompt': 'Prompt builder',
  'ideNew.section.start.templates': 'Template gallery',
  'ideNew.section.start.repository': 'Repository import',
  'ideNew.section.start.preview': 'Runtime preview',
  'ideNew.section.canonical.title': 'Canonical E-Code route',
  'ideNew.section.canonical.body':
    'New project creation lives at /projects/new so authentication, quotas, and project persistence remain centralized.',
  'ideNew.section.canonical.route': '/projects/new',
  'ideNew.section.canonical.workspace': 'Authenticated workspace',
  'ideNew.section.canonical.quota': 'Quota checks',
  'ideNew.section.canonical.persistence': 'Project persistence',
} as const;

export type IdeNewRouteKey = keyof typeof ideNewRouteEn;
export type IdeNewRouteCopy = Readonly<Record<IdeNewRouteKey, string>>;

export const ideNewRouteFr: IdeNewRouteCopy = {
  'ideNew.seo.title': 'Créer un nouveau projet dans l’IDE — E-Code',
  'ideNew.seo.description':
    'Créez un projet E-Code à partir d’un prompt, d’un modèle ou d’un dépôt, puis poursuivez dans l’IDE E-Code complet.',
  'ideNew.seo.imageAlt': 'Création d’un nouveau projet dans l’IDE E-Code',
  'ideNew.page.title': 'Créer un nouveau projet dans l’IDE',
  'ideNew.page.eyebrow': 'IDE',
  'ideNew.page.description':
    'La route historique E-Code /ide/new reste disponible et vous dirige vers la création de projets sans remplacer l’IDE E-Code.',
  'ideNew.page.primaryAction': 'Créer un projet',
  'ideNew.page.secondaryAction': 'Parcourir les modèles',
  'ideNew.highlight.projectCreation': 'Création de projet',
  'ideNew.highlight.ide': 'IDE E-Code',
  'ideNew.highlight.templates': 'Modèles',
  'ideNew.highlight.runtimeSetup': 'Configuration de l’environnement d’exécution',
  'ideNew.section.start.title': 'Créer à partir d’un prompt ou d’un modèle',
  'ideNew.section.start.body':
    'Commencez avec un prompt en langage naturel, importez un dépôt ou choisissez un modèle, puis ouvrez le projet dans l’IDE.',
  'ideNew.section.start.prompt': 'Création par prompt',
  'ideNew.section.start.templates': 'Galerie de modèles',
  'ideNew.section.start.repository': 'Importation d’un dépôt',
  'ideNew.section.start.preview': 'Aperçu de l’environnement d’exécution',
  'ideNew.section.canonical.title': 'Route E-Code canonique',
  'ideNew.section.canonical.body':
    'La création de projets se trouve sur /projects/new afin de centraliser l’authentification, les quotas et la persistance des projets.',
  'ideNew.section.canonical.route': '/projects/new',
  'ideNew.section.canonical.workspace': 'Espace de travail authentifié',
  'ideNew.section.canonical.quota': 'Vérification des quotas',
  'ideNew.section.canonical.persistence': 'Persistance des projets',
};

export function resolveIdeNewRouteLanguage(language?: string | null): 'en' | 'fr' {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

export function getIdeNewRouteCopy(language?: string | null): IdeNewRouteCopy {
  return resolveIdeNewRouteLanguage(language) === 'fr' ? ideNewRouteFr : ideNewRouteEn;
}
