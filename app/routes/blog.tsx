import type { MetaFunction } from 'react-router';
import Blog from '~/components/marketing/ecode-exact/pages/Blog';

export const meta: MetaFunction = () => [
  { title: 'Blog — E-Code' },
  { name: 'description', content: 'The E-Code blog — product updates, engineering and AI development.' },
];

export default function BlogRoute() {
  return <Blog />;
}
