import type { MetaFunction } from '@remix-run/cloudflare';
import Partners from '~/components/marketing/ecode-exact/pages/Partners';

export const meta: MetaFunction = () => [
  { title: 'Partners — VibeCore' },
  { name: 'description', content: 'Partner with VibeCore — technology, solutions and agency partner programs.' },
];

export default function PartnersRoute() {
  return <Partners />;
}
