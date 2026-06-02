import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { comparePages, MarketingDynamicPage } from '~/components/marketing/EcodeMarketingPages';

/*
 * Throw the 404 from the loader so an unknown slug yields a true HTTP 404 instead
 * of a soft-404 (HTTP 200 "not found" body). See $slug.tsx for the rationale.
 */
export const loader = ({ params }: LoaderFunctionArgs) => {
  if (!(comparePages as Record<string, unknown>)[params.slug ?? '']) {
    throw new Response('Not Found', { status: 404, statusText: 'Not Found' });
  }

  return null;
};

export const meta = () => [
  { title: 'E-Code comparisons' },
  { name: 'description', content: 'Platform comparison pages for E-Code.' },
];

export default function CompareSlugRoute() {
  return <MarketingDynamicPage pages={comparePages} fallbackTitle="Compare" />;
}
