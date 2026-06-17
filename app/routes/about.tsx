import type { MetaFunction } from '@remix-run/cloudflare';
import About from '~/components/marketing/ecode-exact/pages/About';
export const meta: MetaFunction = () => [
  { title: 'About — E-Code' },
  { name: 'description', content: 'About E-Code — building AI-native software creation for everyone.' },
];
export default function AboutRoute() {
  return <About />;
}
