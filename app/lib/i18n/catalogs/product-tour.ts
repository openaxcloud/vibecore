import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export const productTourEn = {
  'productTour.step.navigation.title': 'Navigate your workspace',
  'productTour.step.navigation.description':
    'Projects, usage, billing, team controls, and account settings stay together in the main menu.',
  'productTour.step.createProject.title': 'Build from a prompt',
  'productTour.step.createProject.description':
    'Choose New project, describe what you need, then add advanced options only when they are useful.',
  'productTour.step.tools.title': 'Find work and updates',
  'productTour.step.tools.description':
    'Search opens any workspace destination, while notifications keep recent activity close at hand.',
  'productTour.step.help.title': 'Return whenever you need it',
  'productTour.step.help.description': 'Open Help to resume this guide, read the documentation, or contact support.',
  'productTour.stepCounter': 'Guided tour — Step {{current}} of {{total}}',
  'productTour.close': 'Close guided tour',
  'productTour.progress': 'Guided tour progress',
  'productTour.action.later': 'Not now',
  'productTour.action.back': 'Back',
  'productTour.action.finish': 'Finish',
  'productTour.action.next': 'Next',
} as const;

export type ProductTourKey = keyof typeof productTourEn;
export type ProductTourCopy = Readonly<Record<ProductTourKey, string>>;

export const productTourFr: ProductTourCopy = {
  'productTour.step.navigation.title': 'Parcourez votre espace de travail',
  'productTour.step.navigation.description':
    'Projets, utilisation, facturation, gestion de l’équipe et paramètres du compte sont regroupés dans le menu principal.',
  'productTour.step.createProject.title': 'Créez à partir d’un prompt',
  'productTour.step.createProject.description':
    'Choisissez Nouveau projet, décrivez votre besoin, puis ajoutez les options avancées uniquement si elles sont utiles.',
  'productTour.step.tools.title': 'Retrouvez votre travail et les nouveautés',
  'productTour.step.tools.description':
    'La recherche ouvre chaque destination de l’espace de travail, tandis que les notifications gardent l’activité récente à portée de main.',
  'productTour.step.help.title': 'Revenez-y à tout moment',
  'productTour.step.help.description':
    'Ouvrez l’aide pour reprendre cette visite, consulter la documentation ou contacter l’assistance.',
  'productTour.stepCounter': 'Visite guidée — Étape {{current}} sur {{total}}',
  'productTour.close': 'Fermer la visite guidée',
  'productTour.progress': 'Progression de la visite guidée',
  'productTour.action.later': 'Plus tard',
  'productTour.action.back': 'Retour',
  'productTour.action.finish': 'Terminer',
  'productTour.action.next': 'Suivant',
};

export function resolveProductTourLanguage(language?: string | null): MarketingLanguage {
  return resolveMarketingLanguage(language);
}

export function getProductTourCopy(language?: string | null): ProductTourCopy {
  return resolveProductTourLanguage(language) === 'fr' ? productTourFr : productTourEn;
}

export function formatProductTourCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatProductTourStepCounter(
  language: string | null | undefined,
  current: number,
  total: number,
): string {
  const resolved = resolveProductTourLanguage(language);
  const locale = resolved === 'fr' ? 'fr-FR' : 'en-US';
  const copy = getProductTourCopy(resolved);
  const formatter = new Intl.NumberFormat(locale);

  return formatProductTourCopy(copy['productTour.stepCounter'], {
    current: formatter.format(current),
    total: formatter.format(total),
  });
}
