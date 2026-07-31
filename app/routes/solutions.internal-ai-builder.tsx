import { INTERNAL_AI_BUILDER_COPY } from '~/components/marketing/solutions/internal-ai-builder.copy';
import { makeSolutionRoute } from '~/components/marketing/solutions/solution-route';

const route = makeSolutionRoute(
  {
    slug: 'internal-ai-builder',
    canonicalUrl: 'https://e-code.ai/solutions/internal-ai-builder',
    ogImage: { en: 'https://e-code.ai/assets/og-default.png', fr: 'https://e-code.ai/assets/og-default.png' },
  },
  INTERNAL_AI_BUILDER_COPY,
);

export const handle = route.handle;
export const loader = route.loader;
export const meta = route.meta;
export const headers = route.headers;
export const links = route.links;

export default function InternalAiBuilderSolutionRoute() {
  return <route.Component />;
}
