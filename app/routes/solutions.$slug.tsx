import { data as json, type LoaderFunctionArgs, type MetaFunction } from 'react-router';

import { MarketingDynamicPage, solutionPages } from '~/components/marketing/EcodeMarketingPages';

/**
 * In-repo SSR solution page (app-builder, website-builder, enterprise, …).
 * Renders the e-code public shell + the marketing page definition from
 * `solutionPages`; unknown slugs 404 server-side. Replaces the external proxy.
 */
export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? `${data.title} — E-Code` : 'Solutions — E-Code' },
  {
    name: 'description',
    content: data?.description ?? 'E-Code solutions for app builders, websites, games, dashboards and teams.',
  },
];

export function loader({ params }: LoaderFunctionArgs) {
  const slug = params.slug ?? '';
  const page = solutionPages[slug as keyof typeof solutionPages];

  if (!page) {
    throw new Response('Solution page not found', { status: 404 });
  }

  return json({ title: page.title, description: page.description });
}

export default function SolutionSlugRoute() {
  return <MarketingDynamicPage pages={solutionPages} fallbackTitle="Solutions" />;
}
