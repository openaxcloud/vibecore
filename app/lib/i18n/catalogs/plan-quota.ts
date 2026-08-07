import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const planQuotaEn = {
  'planComparison.meta.title': 'Compare plans - E-Code',
  'planComparison.meta.description':
    'Compare E-Code plans for projects, private previews, deployments, collaboration and enterprise controls.',
  'planComparison.page.title': 'Compare plans',
  'planComparison.page.description': 'Compare Starter, Core, Pro and Enterprise capabilities.',
  'planComparison.plan.starter.name': 'Starter',
  'planComparison.plan.starter.summary': 'Public templates and small workspaces.',
  'planComparison.plan.core.name': 'Core',
  'planComparison.plan.core.summary': 'Private previews, deployments and access to more capable models.',
  'planComparison.plan.pro.name': 'Pro',
  'planComparison.plan.pro.summary': 'Collaboration, shared billing and audit logs.',
  'planComparison.plan.enterprise.name': 'Enterprise',
  'planComparison.plan.enterprise.summary': 'SSO, SCIM, custom quotas, audit exports and private deployment options.',
  'planComparison.action.choose': 'Choose {plan}',
  'planComparison.action.sales': 'Talk to sales',
  'planComparison.action.startingCheckout': 'Opening checkout…',
  'planComparison.action.checkoutProgress': 'Opening secure checkout for {plan}',
  'planComparison.error.organizationMissing': 'No organization was found for your account.',
  'planComparison.error.invalidPlan': 'Choose a plan available for online checkout.',
  'planComparison.error.checkoutUnavailable': 'Checkout is unavailable right now. Try again later.',
  'planComparison.error.checkoutTemporary': 'Checkout is temporarily unavailable. Try again in a moment.',
  'quotaExceeded.meta.title': 'Usage limit reached - E-Code',
  'quotaExceeded.meta.description': 'Review E-Code plan options after an organization usage limit prevents an action.',
  'quotaExceeded.page.title': 'Usage limit reached',
  'quotaExceeded.page.description':
    'Your current plan limit stopped this action before any additional usage was recorded.',
  'quotaExceeded.guidance': 'Upgrade the plan or ask an organization administrator to adjust the limit.',
  'quotaExceeded.action.upgrade': 'Upgrade plan',
  'quotaExceeded.action.compare': 'Compare plans',
} as const;

export type PlanQuotaKey = keyof typeof planQuotaEn;
export type PlanQuotaCopy = Readonly<Record<PlanQuotaKey, string>>;

export const planQuotaFr: PlanQuotaCopy = {
  'planComparison.meta.title': 'Comparer les offres - E-Code',
  'planComparison.meta.description':
    'Comparez les offres E-Code pour les projets, les aperçus privés, les déploiements, la collaboration et les contrôles d’entreprise.',
  'planComparison.page.title': 'Comparer les offres',
  'planComparison.page.description': 'Comparez les fonctionnalités des offres Starter, Core, Pro et Enterprise.',
  'planComparison.plan.starter.name': 'Starter',
  'planComparison.plan.starter.summary': 'Modèles publics et petits espaces de travail.',
  'planComparison.plan.core.name': 'Core',
  'planComparison.plan.core.summary':
    'Aperçus privés, déploiements et accès à des modèles aux capacités plus avancées.',
  'planComparison.plan.pro.name': 'Pro',
  'planComparison.plan.pro.summary': 'Collaboration, facturation partagée et journaux d’audit.',
  'planComparison.plan.enterprise.name': 'Enterprise',
  'planComparison.plan.enterprise.summary':
    'SSO, SCIM, quotas personnalisés, export des journaux d’audit et options de déploiement privé.',
  'planComparison.action.choose': 'Choisir {plan}',
  'planComparison.action.sales': 'Contacter l’équipe commerciale',
  'planComparison.action.startingCheckout': 'Ouverture du paiement…',
  'planComparison.action.checkoutProgress': 'Ouverture du paiement sécurisé pour l’offre {plan}',
  'planComparison.error.organizationMissing': 'Aucune organisation n’est associée à votre compte.',
  'planComparison.error.invalidPlan': 'Choisissez une offre disponible à la souscription en ligne.',
  'planComparison.error.checkoutUnavailable': 'Le paiement est indisponible pour le moment. Réessayez ultérieurement.',
  'planComparison.error.checkoutTemporary':
    'Le paiement est temporairement indisponible. Réessayez dans quelques instants.',
  'quotaExceeded.meta.title': 'Limite d’utilisation atteinte - E-Code',
  'quotaExceeded.meta.description':
    'Consultez les offres E-Code lorsqu’une limite d’utilisation de votre organisation empêche une action.',
  'quotaExceeded.page.title': 'Limite d’utilisation atteinte',
  'quotaExceeded.page.description':
    'La limite de votre offre actuelle a interrompu cette action avant qu’une utilisation supplémentaire ne soit enregistrée.',
  'quotaExceeded.guidance':
    'Passez à une offre supérieure ou demandez à un administrateur de l’organisation d’ajuster la limite.',
  'quotaExceeded.action.upgrade': 'Changer d’offre',
  'quotaExceeded.action.compare': 'Comparer les offres',
};

export function getPlanQuotaCopy(language?: string | null): PlanQuotaCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? planQuotaFr : planQuotaEn;
}

export function formatPlanQuotaCopy(template: string, values: Readonly<Record<string, string | number>> = {}): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
