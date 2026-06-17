import type { MetaFunction } from 'react-router';
import Careers from '~/components/marketing/ecode-exact/pages/Careers';

export const meta: MetaFunction = () => [
  { title: 'Careers — VibeCore' },
  {
    name: 'description',
    content:
      'Join VibeCore — help build AI-native software creation. Open roles across engineering, design and go-to-market.',
  },
];

export default function CareersRoute() {
  return <Careers />;
}
