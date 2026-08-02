import { FREELANCERS_COPY } from '~/components/marketing/solutions/freelancers.copy';
import { makeSolutionRoute } from '~/components/marketing/solutions/solution-route';

const route = makeSolutionRoute(
  {
    slug: 'freelancers',
    canonicalUrl: 'https://e-code.ai/solutions/freelancers',
    ogImage: {
      en: 'https://e-code.ai/assets/og/solutions/freelancers-en.png',
      fr: 'https://e-code.ai/assets/og/solutions/freelancers-fr.png',
    },
  },
  FREELANCERS_COPY,
);

export const handle = route.handle;
export const loader = route.loader;
export const meta = route.meta;
export const headers = route.headers;
export const links = route.links;

export default function FreelancersSolutionRoute() {
  return <route.Component />;
}
