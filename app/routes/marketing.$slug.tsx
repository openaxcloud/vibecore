import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/cloudflare';
import { useParams } from '@remix-run/react';
import { MarketingDynamicPage, marketingCampaignPages } from '~/components/marketing/EcodeMarketingPages';
import { EcodeCampaignPage, ecodeCampaignMarketingPages } from '~/components/marketing/EcodeProductMarketingPages';

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

export const meta: MetaFunction = ({ params }) => {
  const slug = params.slug ?? '';

  const page =
    (ecodeCampaignMarketingPages as Record<string, { title: string; description: string }>)[slug] ??
    (marketingCampaignPages as Record<string, { title: string; description: string }>)[slug];

  return [
    { title: page ? `${page.title} - E-Code` : 'E-Code marketing' },
    {
      name: 'description',
      content: page?.description ?? 'E-Code campaign pages for teams, deployments and bounties.',
    },
  ];
};

export default function MarketingSlugRoute() {
  const slug = useParams().slug;

  if (slug && (ecodeCampaignMarketingPages as Record<string, unknown>)[slug]) {
    return <EcodeCampaignPage slug={slug as keyof typeof ecodeCampaignMarketingPages} />;
  }

  return <MarketingDynamicPage pages={marketingCampaignPages} fallbackTitle="Marketing" />;
}
