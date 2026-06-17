import type { MetaFunction } from '@remix-run/cloudflare';
import Contact from '~/components/marketing/ecode-exact/pages/Contact';

export const meta: MetaFunction = () => [
  { title: 'Contact — VibeCore' },
  { name: 'description', content: 'Contact VibeCore — sales, support, press and security.' },
];

export default function ContactRoute() {
  return <Contact />;
}
