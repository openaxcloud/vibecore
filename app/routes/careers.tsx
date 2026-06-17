import type { MetaFunction } from '@remix-run/cloudflare';
import Careers from '~/components/marketing/ecode-exact/pages/Careers';

export const meta: MetaFunction = () => [
  { title: 'Careers — E-Code' },
  {
    name: 'description',
    content:
      'Join E-Code — help build AI-native software creation. Open roles across engineering, design and go-to-market.',
  },
];

export default function CareersRoute() {
  return <Careers />;
}
