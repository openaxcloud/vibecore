import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export const upgradeEn = {
  'upgrade.metaTitle': 'Upgrade - E-Code',
  'upgrade.title': 'Upgrade',
  'upgrade.description':
    'Plans and prices come from the live billing catalog—the same records used by Stripe Checkout.',
  'upgrade.access.description': 'Move your organization to a higher plan.',
  'upgrade.access.restricted':
    'Plan and price details are available only to organization owners and billing administrators. Ask an owner to upgrade, or check your role on the {billingPage}.',
  'upgrade.access.billingPage': 'billing page',
  'upgrade.errors.organization': 'No organization was found for your account.',
  'upgrade.errors.portal': 'The billing portal is unavailable right now. Try again.',
  'upgrade.errors.portalTemporary': 'The billing portal is temporarily unavailable. Try again later.',
  'upgrade.errors.invalidPlan': 'Choose a plan that supports self-service checkout.',
  'upgrade.errors.checkout': 'Checkout is unavailable right now. Try again later.',
  'upgrade.errors.checkoutTemporary': 'Checkout is temporarily unavailable. Try again later.',
  'upgrade.subscription.active':
    'Your organization already has an active subscription. Plan changes, including downgrades, are made in the Stripe billing portal and prorated by Stripe.',
  'upgrade.subscription.new':
    'Starting a plan opens Stripe Checkout. Your subscription begins immediately at the price shown.',
  'upgrade.interval.legend': 'Billing interval',
  'upgrade.interval.monthly': 'Monthly',
  'upgrade.interval.annual': 'Annual—the discounted annual amount is shown in Stripe Checkout',
  'upgrade.badge.current': 'Your plan',
  'upgrade.badge.suggested': 'Suggested',
  'upgrade.price.custom': 'Custom',
  'upgrade.price.month': ' / month',
  'upgrade.price.noAnnual': 'No annual price is configured for this plan. It is billed monthly.',
  'upgrade.limit.projects_one': '{count} project',
  'upgrade.limit.projects_other': '{count} projects',
  'upgrade.limit.workspaces_one': '{count} active workspace',
  'upgrade.limit.workspaces_other': '{count} active workspaces',
  'upgrade.limit.members_one': '{count} team member',
  'upgrade.limit.members_other': '{count} team members',
  'upgrade.limit.messages_one': '{count} AI message / month',
  'upgrade.limit.messages_other': '{count} AI messages / month',
  'upgrade.limit.storage': '{count} GB storage',
  'upgrade.enterprise.features': 'Custom quotas, SSO/SAML and premium support',
  'upgrade.actions.current': 'Current plan',
  'upgrade.actions.sales': 'Talk to sales',
  'upgrade.actions.downgradePortal': 'Downgrade in billing portal',
  'upgrade.actions.changePortal': 'Change in billing portal',
  'upgrade.actions.upgrade': 'Upgrade to {plan}',
  'upgrade.actions.noCheckout': 'No checkout needed',
  'upgrade.enterprise.prompt': 'Need Enterprise (SSO/SAML, custom quotas and premium support)?',
} as const;

export type UpgradeKey = keyof typeof upgradeEn;
export type UpgradeCopy = Readonly<Record<UpgradeKey, string>>;

export const upgradeFr: UpgradeCopy = {
  'upgrade.metaTitle': 'Changer de formule - E-Code',
  'upgrade.title': 'Changer de formule',
  'upgrade.description':
    'Les formules et les prix proviennent du catalogue de facturation actif, également utilisé par Stripe Checkout.',
  'upgrade.access.description': 'Passez votre organisation à une formule supérieure.',
  'upgrade.access.restricted':
    'Les détails des formules et des prix sont réservés aux propriétaires de l’organisation et aux administrateurs de la facturation. Demandez à un propriétaire de changer de formule ou vérifiez votre rôle sur la {billingPage}.',
  'upgrade.access.billingPage': 'page Facturation',
  'upgrade.errors.organization': 'Aucune organisation n’est associée à votre compte.',
  'upgrade.errors.portal': 'Le portail de facturation est indisponible pour le moment. Réessayez.',
  'upgrade.errors.portalTemporary':
    'Le portail de facturation est temporairement indisponible. Réessayez ultérieurement.',
  'upgrade.errors.invalidPlan': 'Choisissez une formule disponible en souscription autonome.',
  'upgrade.errors.checkout': 'Le paiement est indisponible pour le moment. Réessayez ultérieurement.',
  'upgrade.errors.checkoutTemporary': 'Le paiement est temporairement indisponible. Réessayez ultérieurement.',
  'upgrade.subscription.active':
    'Votre organisation dispose déjà d’un abonnement actif. Les changements de formule, y compris les passages à une formule inférieure, s’effectuent dans le portail de facturation Stripe et sont calculés au prorata par Stripe.',
  'upgrade.subscription.new':
    'La souscription ouvre Stripe Checkout. Votre abonnement commence immédiatement au prix indiqué.',
  'upgrade.interval.legend': 'Période de facturation',
  'upgrade.interval.monthly': 'Mensuelle',
  'upgrade.interval.annual': 'Annuelle — le montant annuel remisé est affiché dans Stripe Checkout',
  'upgrade.badge.current': 'Votre formule',
  'upgrade.badge.suggested': 'Recommandée',
  'upgrade.price.custom': 'Sur devis',
  'upgrade.price.month': ' / mois',
  'upgrade.price.noAnnual': 'Aucun prix annuel n’est configuré pour cette formule. Elle est facturée mensuellement.',
  'upgrade.limit.projects_one': '{count} projet',
  'upgrade.limit.projects_other': '{count} projets',
  'upgrade.limit.workspaces_one': '{count} espace de travail actif',
  'upgrade.limit.workspaces_other': '{count} espaces de travail actifs',
  'upgrade.limit.members_one': '{count} membre de l’équipe',
  'upgrade.limit.members_other': '{count} membres de l’équipe',
  'upgrade.limit.messages_one': '{count} message IA / mois',
  'upgrade.limit.messages_other': '{count} messages IA / mois',
  'upgrade.limit.storage': '{count} Go de stockage',
  'upgrade.enterprise.features': 'Quotas personnalisés, SSO/SAML et assistance premium',
  'upgrade.actions.current': 'Formule actuelle',
  'upgrade.actions.sales': 'Contacter l’équipe commerciale',
  'upgrade.actions.downgradePortal': 'Passer à une formule inférieure dans le portail',
  'upgrade.actions.changePortal': 'Changer de formule dans le portail',
  'upgrade.actions.upgrade': 'Choisir la formule {plan}',
  'upgrade.actions.noCheckout': 'Aucune souscription nécessaire',
  'upgrade.enterprise.prompt':
    'Besoin de la formule Enterprise (SSO/SAML, quotas personnalisés et assistance premium) ?',
};

export function getUpgradeCopy(language?: string | null): UpgradeCopy {
  return resolveMarketingLanguage(language) === 'fr' ? upgradeFr : upgradeEn;
}

export function resolveUpgradeLanguage(language?: string | null): MarketingLanguage {
  return resolveMarketingLanguage(language);
}

export function formatUpgradeCopy(template: string, values: Readonly<Record<string, string | number>> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatUpgradeAmount(cents: number, language?: string | null): string {
  return new Intl.NumberFormat(resolveUpgradeLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function upgradeLimitLabel(
  copy: UpgradeCopy,
  language: MarketingLanguage,
  kind: 'projects' | 'workspaces' | 'members' | 'messages',
  count: number,
): string {
  const category =
    new Intl.PluralRules(language === 'fr' ? 'fr-FR' : 'en-US').select(count) === 'one' ? 'one' : 'other';

  const formatted = new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-US').format(count);

  return formatUpgradeCopy(copy[`upgrade.limit.${kind}_${category}`], { count: formatted });
}
