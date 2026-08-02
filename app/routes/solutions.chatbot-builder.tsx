import { CHATBOT_BUILDER_COPY } from '~/components/marketing/solutions/chatbot-builder.copy';
import { makeSolutionRoute } from '~/components/marketing/solutions/solution-route';

const route = makeSolutionRoute(
  {
    slug: 'chatbot-builder',
    canonicalUrl: 'https://e-code.ai/solutions/chatbot-builder',
    ogImage: {
      en: 'https://e-code.ai/assets/og/solutions/chatbot-builder-en.png',
      fr: 'https://e-code.ai/assets/og/solutions/chatbot-builder-fr.png',
    },
  },
  CHATBOT_BUILDER_COPY,
);

export const handle = route.handle;
export const loader = route.loader;
export const meta = route.meta;
export const headers = route.headers;
export const links = route.links;

export default function ChatbotBuilderSolutionRoute() {
  return <route.Component />;
}
