import { DASHBOARD_BUILDER_COPY } from '~/components/marketing/solutions/dashboard-builder.copy';
import { makeSolutionRoute } from '~/components/marketing/solutions/solution-route';

const route = makeSolutionRoute(
  {
    slug: 'dashboard-builder',
    canonicalUrl: 'https://e-code.ai/solutions/dashboard-builder',
    ogImage: {
      en: 'https://e-code.ai/assets/og/solutions/dashboard-builder-en.png',
      fr: 'https://e-code.ai/assets/og/solutions/dashboard-builder-fr.png',
    },
  },
  DASHBOARD_BUILDER_COPY,
);

export const handle = route.handle;
export const loader = route.loader;
export const meta = route.meta;
export const headers = route.headers;
export const links = route.links;

export default function DashboardBuilderSolutionRoute() {
  return <route.Component />;
}
