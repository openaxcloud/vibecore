import { data as json, type LoaderFunctionArgs, type MetaFunction } from 'react-router';

import { comparePages, MarketingDynamicPage } from '~/components/marketing/EcodeMarketingPages';

/**
 * In-repo SSR compare page (E-Code vs <competitor>). Renders the e-code public
 * shell + the marketing page definition from `comparePages`; unknown slugs 404
 * server-side. Replaces the external-bundle proxy.
 */
export const meta: MetaFunction<typeof loader> = ({ data }) => [
  /*
   * `data.title` is already the full "E-Code vs <competitor>" string from
   * makeCompare(); only append the page-kind suffix (prepending "E-Code vs"
   * here doubled it into "E-Code vs E-Code vs Heroku").
   */
  { title: data ? `${data.title} — Compare` : 'Compare — E-Code' },
  {
    name: 'description',
    content: data?.description ?? 'How E-Code compares to other AI development platforms.',
  },
];

export function loader({ params }: LoaderFunctionArgs) {
  const slug = params.slug ?? '';
  const page = comparePages[slug as keyof typeof comparePages];

  if (!page) {
    throw new Response('Compare page not found', { status: 404 });
  }

  return json({ title: page.title, description: page.description });
}

export default function CompareSlugRoute() {
  return <MarketingDynamicPage pages={comparePages} fallbackTitle="Compare" />;
}
