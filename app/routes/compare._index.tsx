import type { MetaFunction } from '@remix-run/cloudflare';

import CompareIndex from '~/components/marketing/ecode-exact/pages/CompareIndex';

export const meta: MetaFunction = () => [
  { title: 'Compare — VibeCore' },
  { name: 'description', content: 'How VibeCore compares to other AI development platforms.' },
];

export default function CompareIndexRoute() {
  return <CompareIndex />;
}
