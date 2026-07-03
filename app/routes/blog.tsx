import type { MetaFunction } from 'react-router';
import Blog from '~/components/marketing/ecode-exact/pages/Blog';
import { socialMetaTags } from '~/utils/social-meta';

export const meta: MetaFunction = () => [
  { title: 'Blog — E-Code' },
  { name: 'description', content: 'The E-Code blog — product updates, engineering and AI development.' },
  ...socialMetaTags({
    title: 'Blog — E-Code',
    description: 'The E-Code blog — product updates, engineering and AI development.',
  }),
];

export default function BlogRoute() {
  return <Blog />;
}
