import type { MetaFunction } from 'react-router';
import About from '~/components/marketing/ecode-exact/pages/About';
import { socialMetaTags } from '~/utils/social-meta';
export const meta: MetaFunction = () => [
  { title: 'About — E-Code' },
  { name: 'description', content: 'About E-Code — building AI-native software creation for everyone.' },
  ...socialMetaTags({
    title: 'About — E-Code',
    description: 'About E-Code — building AI-native software creation for everyone.',
  }),
];
export default function AboutRoute() {
  return <About />;
}
