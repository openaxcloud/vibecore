import type { MetaFunction } from 'react-router';
import Partners from '~/components/marketing/ecode-exact/pages/Partners';

export const meta: MetaFunction = () => [
  { title: 'Partners — E-Code' },
  { name: 'description', content: 'Partner with E-Code — technology, solutions and agency partner programs.' },
];

export default function PartnersRoute() {
  return <Partners />;
}
