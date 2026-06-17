import type { MetaFunction } from 'react-router';
import Contact from '~/components/marketing/ecode-exact/pages/Contact';

export const meta: MetaFunction = () => [
  { title: 'Contact — VibeCore' },
  { name: 'description', content: 'Contact VibeCore — sales, support, press and security.' },
];

export default function ContactRoute() {
  return <Contact />;
}
