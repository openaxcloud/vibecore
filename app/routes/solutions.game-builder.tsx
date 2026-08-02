import { GAME_BUILDER_COPY } from '~/components/marketing/solutions/game-builder.copy';
import { makeSolutionRoute } from '~/components/marketing/solutions/solution-route';

const route = makeSolutionRoute(
  {
    slug: 'game-builder',
    canonicalUrl: 'https://e-code.ai/solutions/game-builder',
    ogImage: {
      en: 'https://e-code.ai/assets/og/solutions/game-builder-en.png',
      fr: 'https://e-code.ai/assets/og/solutions/game-builder-fr.png',
    },
  },
  GAME_BUILDER_COPY,
);

export const handle = route.handle;
export const loader = route.loader;
export const meta = route.meta;
export const headers = route.headers;
export const links = route.links;

export default function GameBuilderSolutionRoute() {
  return <route.Component />;
}
