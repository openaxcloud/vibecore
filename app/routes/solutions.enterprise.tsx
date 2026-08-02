import { ENTERPRISE_COPY } from '~/components/marketing/solutions/enterprise.copy';
import { makeSolutionRoute } from '~/components/marketing/solutions/solution-route';

const route = makeSolutionRoute(
  {
    slug: 'enterprise',
    canonicalUrl: 'https://e-code.ai/solutions/enterprise',
    ogImage: {
      en: 'https://e-code.ai/assets/og/solutions/enterprise-en.png',
      fr: 'https://e-code.ai/assets/og/solutions/enterprise-fr.png',
    },
  },
  ENTERPRISE_COPY,
);

export const handle = route.handle;
export const loader = route.loader;
export const meta = route.meta;
export const headers = route.headers;
export const links = route.links;

export default function EnterpriseSolutionRoute() {
  return <route.Component />;
}
