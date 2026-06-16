import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/cloudflare';
import { useParams } from '@remix-run/react';

import { EcodeCampaignPage, ecodeCampaignMarketingPages } from '~/components/marketing/EcodeProductMarketingPages';

type CampaignSlug = keyof typeof ecodeCampaignMarketingPages;

const CAMPAIGN_SLUGS = new Set<string>(Object.keys(ecodeCampaignMarketingPages));

// In-repo SSR (main Remix app) for the known campaign pages; unknown slugs 404.
export function loader({ params }: LoaderFunctionArgs) {
  if (!params.slug || !CAMPAIGN_SLUGS.has(params.slug)) {
    throw new Response('Not Found', { status: 404 });
  }

  return null;
}

export const meta: MetaFunction = ({ params }) => {
  const slug = params.slug as CampaignSlug | undefined;
  const page = slug ? ecodeCampaignMarketingPages[slug] : undefined;

  return [
    { title: page ? `${page.title} — VibeCore` : 'VibeCore' },
    { name: 'description', content: page?.description ?? 'VibeCore' },
  ];
};

export default function MarketingSlugRoute() {
  const { slug } = useParams();
  return <EcodeCampaignPage slug={slug as CampaignSlug} />;
}
