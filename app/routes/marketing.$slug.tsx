import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { MarketingDynamicPage, marketingCampaignPages } from '~/components/marketing/EcodeMarketingPages';

/*
 * Throw the 404 from the loader so an unknown slug yields a true HTTP 404 instead
 * of a soft-404 (HTTP 200 "not found" body). See $slug.tsx for the rationale.
 */
export const loader = ({ params }: LoaderFunctionArgs) => {
  if (!(marketingCampaignPages as Record<string, unknown>)[params.slug ?? '']) {
    throw new Response('Not Found', { status: 404, statusText: 'Not Found' });
  }

  return null;
};

export const meta = () => [
  { title: 'E-Code marketing' },
  { name: 'description', content: 'E-Code campaign pages for teams, deployments and bounties.' },
];

export default function MarketingSlugRoute() {
  return <MarketingDynamicPage pages={marketingCampaignPages} fallbackTitle="Marketing" />;
}
