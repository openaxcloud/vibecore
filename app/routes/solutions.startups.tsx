import { makeSolutionRoute } from '~/components/marketing/solutions/solution-route';
import { STARTUPS_COPY } from '~/components/marketing/solutions/startups.copy';

const route = makeSolutionRoute(
  {
    slug: 'startups',
    canonicalUrl: 'https://e-code.ai/solutions/startups',
    ogImage: { en: 'https://e-code.ai/assets/og-default.png', fr: 'https://e-code.ai/assets/og-default.png' },
  },
  STARTUPS_COPY,
);

export const handle = route.handle;
export const loader = route.loader;
export const meta = route.meta;
export const headers = route.headers;
export const links = route.links;

export default function StartupsSolutionRoute() {
  return <route.Component />;
}
