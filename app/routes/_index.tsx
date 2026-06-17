import type { MetaFunction } from 'react-router';

import LandingOptimized from '~/components/marketing/ecode-exact/pages/LandingOptimized';

// In-repo SSR (main Remix app) rather than the prebuilt external marketing bundle.
export const meta: MetaFunction = () => [
  { title: 'VibeCore — Build, ship and scale apps with AI' },
  {
    name: 'description',
    content:
      'VibeCore is where you create software with AI agents: build full-stack apps from a prompt, collaborate in real time, and deploy to production. Starter (free), Core, Pro and Enterprise plans.',
  },
  { property: 'og:title', content: 'VibeCore' },
  { property: 'og:description', content: 'Build, ship and scale apps with AI agents.' },
];

export default function IndexRoute() {
  return <LandingOptimized />;
}
