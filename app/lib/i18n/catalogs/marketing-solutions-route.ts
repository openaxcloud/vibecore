import { solutionsIndexCardsEn, solutionsIndexCardsFr } from './solutions-index-cards';
import { normalizeSupportedLanguage } from '~/lib/i18n/language';
import { MARKETING_SITE_URL, socialMetaTags } from '~/utils/social-meta';

/*
 * Copy for the `/solutions` index route. The individual solution pages already
 * ship fully localized copy (`solutions/*.copy.ts`); the index that links them
 * was the last surface still hardcoding English in the source, which the i18n
 * source scanner counted as residual debt on this file.
 */
export const marketingSolutionsRouteEn = {
  ...solutionsIndexCardsEn,
  'marketingSolutions.seo.title': 'Solutions — E-Code',
  'marketingSolutions.seo.description':
    'Explore E-Code solutions for app builders, websites, games, dashboards, AI agents and enterprise teams.',
  'marketingSolutions.seo.socialTitle': 'E-Code Solutions',
  'marketingSolutions.index.title': 'E-Code Solutions',
  'marketingSolutions.index.description':
    'Choose the E-Code workflow that matches the app, team and deployment path you need to build.',
} as const;

export type MarketingSolutionsRouteKey = keyof typeof marketingSolutionsRouteEn;
export type MarketingSolutionsRouteCopy = Readonly<Record<MarketingSolutionsRouteKey, string>>;

export const marketingSolutionsRouteFr: MarketingSolutionsRouteCopy = {
  ...solutionsIndexCardsFr,
  'marketingSolutions.seo.title': 'Solutions — E-Code',
  'marketingSolutions.seo.description':
    "Découvrez les solutions E-Code pour créer des applications, des sites web, des jeux, des tableaux de bord, des agents IA et pour les équipes d'entreprise.",
  'marketingSolutions.seo.socialTitle': 'Solutions E-Code',
  'marketingSolutions.index.title': 'Solutions E-Code',
  'marketingSolutions.index.description':
    "Choisissez le flux de travail E-Code adapté à l'application, à l'équipe et au chemin de déploiement dont vous avez besoin.",
};

export function getMarketingSolutionsRouteCopy(language?: string | null): MarketingSolutionsRouteCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? marketingSolutionsRouteFr : marketingSolutionsRouteEn;
}

export function buildMarketingSolutionsMeta(language?: string | null) {
  const copy = getMarketingSolutionsRouteCopy(language);
  const french = normalizeSupportedLanguage(language) === 'fr';
  const title = copy['marketingSolutions.seo.title'];
  const description = copy['marketingSolutions.seo.description'];
  const canonical = `${MARKETING_SITE_URL}/solutions`;

  return [
    { title },
    { name: 'description', content: description },
    ...socialMetaTags({ path: '/solutions', title: copy['marketingSolutions.seo.socialTitle'], description }),
    { property: 'og:locale', content: french ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: french ? 'en_US' : 'fr_FR' },
    { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: `${canonical}?lang=en` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'fr', href: `${canonical}?lang=fr` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: canonical },
  ];
}
