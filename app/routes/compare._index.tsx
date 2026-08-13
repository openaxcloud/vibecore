import type { MetaFunction } from 'react-router';

import CompareIndex from '~/components/marketing/ecode-exact/pages/CompareIndex';

export const meta: MetaFunction = () => [
  { title: 'Compare — E-Code' },
  { name: 'description', content: 'How E-Code compares to other AI development platforms.' },
];

export default function CompareIndexRoute() {
  return <CompareIndex />;
}
