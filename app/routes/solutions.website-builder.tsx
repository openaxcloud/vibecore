import { makeSolutionRoute } from '~/components/marketing/solutions/solution-route';
import { WEBSITE_BUILDER_COPY } from '~/components/marketing/solutions/website-builder.copy';

const route = makeSolutionRoute(
  {
    slug: 'website-builder',
    canonicalUrl: 'https://e-code.ai/solutions/website-builder',
    ogImage: {
      en: 'https://e-code.ai/assets/og/solutions/website-builder-en.png',
      fr: 'https://e-code.ai/assets/og/solutions/website-builder-fr.png',
    },
  },
  WEBSITE_BUILDER_COPY,
);

export const handle = route.handle;
export const loader = route.loader;
export const meta = route.meta;
export const headers = route.headers;
export const links = route.links;

export default function WebsiteBuilderSolutionRoute() {
  return <route.Component />;
}
