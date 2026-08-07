import type { MetaFunction } from 'react-router';
import Contact from '~/components/marketing/ecode-exact/pages/Contact';
import { socialMetaTags } from '~/utils/social-meta';

export const meta: MetaFunction = () => [
  { title: 'Contact — E-Code' },
  { name: 'description', content: 'Contact E-Code — sales, support, press and security.' },
  ...socialMetaTags({
    path: '/contact',
    title: 'Contact — E-Code',
    description: 'Contact E-Code — sales, support, press and security.',
  }),
];

export default function ContactRoute() {
  return <Contact />;
}
