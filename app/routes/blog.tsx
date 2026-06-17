import type { MetaFunction } from '@remix-run/cloudflare';
import Blog from '~/components/marketing/ecode-exact/pages/Blog';

export const meta: MetaFunction = () => [
  { title: 'Blog — VibeCore' },
  { name: 'description', content: 'The VibeCore blog — product updates, engineering and AI development.' },
];

export default function BlogRoute() {
  return <Blog />;
}
