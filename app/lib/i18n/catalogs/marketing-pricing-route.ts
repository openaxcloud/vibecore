import { normalizeSupportedLanguage } from '~/lib/i18n/language';
import { MARKETING_SITE_URL, socialMetaTags } from '~/utils/social-meta';

export const marketingPricingRouteEn = {
  'marketingPricing.seo.title': 'Pricing — E-Code',
  'marketingPricing.seo.description':
    'E-Code pricing: Starter with free daily Agent credits, Core at €25 per month (€20 with annual billing), Pro at €100 per month (€95 with annual billing), and Enterprise. Compare credits, parallel agents, collaborators, deployment regions and support.',
  'marketingPricing.seo.imageAlt': 'E-Code pricing plans for individuals, teams and enterprises',
  'marketingPricing.comparison.starter.label': 'Starter',
  'marketingPricing.comparison.starter.sublabel': 'Free forever',
  'marketingPricing.comparison.core.label': 'Core',
  'marketingPricing.comparison.core.sublabel': 'Most popular',
  'marketingPricing.comparison.pro.label': 'Pro',
  'marketingPricing.comparison.pro.sublabel': 'For growing teams',
  'marketingPricing.comparison.enterprise.label': 'Enterprise',
  'marketingPricing.comparison.enterprise.sublabel': 'Custom',
} as const;

export type MarketingPricingRouteKey = keyof typeof marketingPricingRouteEn;
export type MarketingPricingRouteCopy = Readonly<Record<MarketingPricingRouteKey, string>>;

export const marketingPricingRouteFr: MarketingPricingRouteCopy = {
  'marketingPricing.seo.title': 'Tarifs — E-Code',
  'marketingPricing.seo.description':
    'Tarifs E-Code : Starter avec des crédits Agent quotidiens gratuits, Core à 25 € par mois (20 € avec la facturation annuelle), Pro à 100 € par mois (95 € avec la facturation annuelle) et Enterprise. Comparez les crédits, les agents en parallèle, les collaborateurs, les régions de déploiement et le support.',
  'marketingPricing.seo.imageAlt': 'Offres tarifaires E-Code pour les particuliers, les équipes et les entreprises',
  'marketingPricing.comparison.starter.label': 'Starter',
  'marketingPricing.comparison.starter.sublabel': 'Gratuit pour toujours',
  'marketingPricing.comparison.core.label': 'Core',
  'marketingPricing.comparison.core.sublabel': 'Le plus populaire',
  'marketingPricing.comparison.pro.label': 'Pro',
  'marketingPricing.comparison.pro.sublabel': 'Pour les équipes en croissance',
  'marketingPricing.comparison.enterprise.label': 'Enterprise',
  'marketingPricing.comparison.enterprise.sublabel': 'Sur mesure',
};

export function getMarketingPricingRouteCopy(language?: string | null): MarketingPricingRouteCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? marketingPricingRouteFr : marketingPricingRouteEn;
}

export function buildMarketingPricingMeta(language?: string | null) {
  const copy = getMarketingPricingRouteCopy(language);
  const french = normalizeSupportedLanguage(language) === 'fr';
  const title = copy['marketingPricing.seo.title'];
  const description = copy['marketingPricing.seo.description'];
  const imageAlt = copy['marketingPricing.seo.imageAlt'];
  const canonical = `${MARKETING_SITE_URL}/pricing`;

  const social = socialMetaTags({ title, description }).map((tag) => {
    const identifier = 'property' in tag ? tag.property : 'name' in tag ? tag.name : undefined;

    return identifier === 'og:image:alt' || identifier === 'twitter:image:alt' ? { ...tag, content: imageAlt } : tag;
  });

  return [
    { title },
    { name: 'description', content: description },
    ...social,
    { property: 'og:url', content: canonical },
    { property: 'og:locale', content: french ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: french ? 'en_US' : 'fr_FR' },
    { tagName: 'link', rel: 'canonical', href: canonical },
    { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: `${canonical}?lang=en` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'fr', href: `${canonical}?lang=fr` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: canonical },
  ];
}
