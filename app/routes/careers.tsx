import type { MetaFunction } from 'react-router';
import Careers from '~/components/marketing/ecode-exact/pages/Careers';
import { socialMetaTags } from '~/utils/social-meta';

export const meta: MetaFunction = () => [
  { title: 'Careers — E-Code' },
  {
    name: 'description',
    content:
      'Join E-Code — help build AI-native software creation. Open roles across engineering, design and go-to-market.',
  },
  ...socialMetaTags({
    title: 'Careers — E-Code',
    description:
      'Join E-Code — help build AI-native software creation. Open roles across engineering, design and go-to-market.',
  }),
];

export default function CareersRoute() {
  return <Careers />;
}
