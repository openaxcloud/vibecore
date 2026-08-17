import type { MetaFunction } from 'react-router';
import AI from './ecode-exact/pages/AI';
import AIAgent from './ecode-exact/pages/AIAgent';
import Bounties from './ecode-exact/pages/Bounties';
import Features from './ecode-exact/pages/Features';
import Mobile from './ecode-exact/pages/Mobile';
import Deployments from './ecode-exact/pages/PublicDeploymentsPage';
import Teams from './ecode-exact/pages/PublicTeamPage';
import { formatMarketingDocumentTitle } from '~/lib/i18n/catalogs/marketing';
import {
  getMarketingExactProductControlsCopy,
  type ExactCampaignPageKey,
  type ExactProductPageCopy,
  type ExactProductPageKey,
} from '~/lib/i18n/catalogs/marketing-exact-product-controls';
import { socialMetaTags } from '~/utils/social-meta';

export type ProductPageKey = ExactProductPageKey;
export type CampaignPageKey = ExactCampaignPageKey;

export type PageRouteDefinition = ExactProductPageCopy & {
  route: string;
};

const PRODUCT_ROUTES = {
  'ai-agent': '/ai-agent',
  ide: '/features',
  multiplayer: '/features#multiplayer',
  'mobile-app': '/mobile',
  teams: '/marketing/teams',
  deployments: '/marketing/deployments',
  pricing: '/pricing',
  bounties: '/marketing/bounties',
  'ai-platform': '/ai',
} as const satisfies Record<ProductPageKey, string>;

export function getEcodeExactProductMarketingPages(
  language?: string | null,
): Record<ProductPageKey, PageRouteDefinition> {
  const pages = getMarketingExactProductControlsCopy(language).exactProductRegistry.pages;

  return Object.fromEntries(
    (Object.keys(PRODUCT_ROUTES) as ProductPageKey[]).map((key) => [
      key,
      { ...pages[key], route: PRODUCT_ROUTES[key] },
    ]),
  ) as Record<ProductPageKey, PageRouteDefinition>;
}

export function getEcodeExactCampaignMarketingPages(
  language?: string | null,
): Record<CampaignPageKey, PageRouteDefinition> {
  const pages = getEcodeExactProductMarketingPages(language);

  return {
    bounties: pages.bounties,
    deployments: pages.deployments,
    teams: pages.teams,
  };
}

export const ecodeProductMarketingPages = getEcodeExactProductMarketingPages('en');

export const ecodeCampaignMarketingPages = getEcodeExactCampaignMarketingPages('en');

export function makeEcodeProductMeta(key: ProductPageKey): MetaFunction {
  return ({ data, location, matches }) => {
    const routeLanguage = (data as { language?: string } | undefined)?.language;

    const rootLanguage = (matches?.find((match) => match.id === 'root')?.data as { language?: string } | undefined)
      ?.language;

    const page = getEcodeExactProductMarketingPages(routeLanguage ?? rootLanguage)[key];
    const title = formatMarketingDocumentTitle(page.title);

    /*
     * BUG-MKT-003 : canonical dérivé de `location.pathname`, jamais d'un chemin
     * recopié — une table écrite à la main dérive au premier renommage de route.
     */
    const social = socialMetaTags({ title, description: page.description, path: location?.pathname }).map((tag) => {
      const identifier = 'property' in tag ? tag.property : 'name' in tag ? tag.name : undefined;

      return identifier === 'og:image:alt' || identifier === 'twitter:image:alt'
        ? { ...tag, content: page.imageAlt }
        : tag;
    });

    return [{ title }, { name: 'description', content: page.description }, ...social];
  };
}

export function makeEcodeCampaignMeta(key: CampaignPageKey): MetaFunction {
  return makeEcodeProductMeta(key);
}

export function EcodeAiAgentPage() {
  return <AIAgent />;
}

export function EcodeAiPlatformPage() {
  return <AI />;
}

export function EcodeFeaturesPage() {
  return <Features />;
}

export function EcodeMobilePage() {
  return <Mobile />;
}

export function EcodeDeploymentsPage() {
  return <Deployments />;
}

export function EcodeBountiesPage() {
  return <Bounties />;
}

export function EcodeTeamsPage() {
  return <Teams />;
}

export function EcodeCampaignPage({ slug }: { slug: CampaignPageKey }) {
  if (slug === 'deployments') {
    return <EcodeDeploymentsPage />;
  }

  if (slug === 'teams') {
    return <EcodeTeamsPage />;
  }

  return <EcodeBountiesPage />;
}
