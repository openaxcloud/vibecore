import { data as json, redirect, type LoaderFunctionArgs, type MetaFunction } from 'react-router';

import { MarketingDynamicPage, solutionPages } from '~/components/marketing/EcodeMarketingPages';

/**
 * Legacy/short solution slugs that must resolve to their canonical page instead
 * of 404ing. Kept as permanent (308) redirects so inbound links and search
 * engines settle on the canonical `*-builder` URL. See BUG-SOL-001.
 */
const SOLUTION_SLUG_ALIASES: Record<string, keyof typeof solutionPages> = {
  'internal-ai': 'internal-ai-builder',
};

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

  const canonical = SOLUTION_SLUG_ALIASES[slug];

  if (canonical) {
    throw redirect(`/solutions/${canonical}`, 308);
  }

  const page = solutionPages[slug as keyof typeof solutionPages];

  if (!page) {
    throw new Response('Solution page not found', { status: 404 });
  }

  return json({ title: page.title, description: page.description });
}

export default function SolutionSlugRoute() {
  return <MarketingDynamicPage pages={solutionPages} fallbackTitle="Solutions" />;
}
