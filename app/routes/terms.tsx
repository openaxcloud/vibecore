import type { MetaFunction } from 'react-router';

import Terms from '~/components/marketing/ecode-exact/pages/Terms';
import { socialMetaTags } from '~/utils/social-meta';

// In-repo SSR (main Remix app) rather than the prebuilt external marketing bundle.
export const meta: MetaFunction = () => [
  { title: 'Terms of Service — E-Code' },
  { name: 'description', content: 'E-Code Terms of Service.' },
  ...socialMetaTags({
    path: '/terms',
    title: 'E-Code Terms of Service',
    description: 'The terms governing your use of the E-Code platform.',
  }),
];

export default function TermsRoute() {
  return <Terms />;
}
