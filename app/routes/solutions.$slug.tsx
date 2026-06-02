import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { MarketingDynamicPage, solutionPages } from '~/components/marketing/EcodeMarketingPages';

/*
 * Throw the 404 from the loader so an unknown slug yields a true HTTP 404 instead
 * of a soft-404 (HTTP 200 "not found" body). A Response thrown inside
 * MarketingDynamicPage during render cannot change the already-committed document
 * status; the loader runs before the status is sent. See $slug.tsx for details.
 */
export const loader = ({ params }: LoaderFunctionArgs) => {
  if (!(solutionPages as Record<string, unknown>)[params.slug ?? '']) {
    throw new Response('Not Found', { status: 404, statusText: 'Not Found' });
  }

  return null;
};

export const meta = () => [
  { title: 'E-Code solutions' },
  { name: 'description', content: 'E-Code solution pages for builders, teams and enterprises.' },
];

export default function SolutionSlugRoute() {
  return <MarketingDynamicPage pages={solutionPages} fallbackTitle="Solution" />;
}
