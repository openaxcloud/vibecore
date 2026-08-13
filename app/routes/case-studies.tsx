import type { MetaFunction } from 'react-router';
import CaseStudies from '~/components/marketing/ecode-exact/pages/CaseStudies';

export const meta: MetaFunction = () => [
  { title: 'Case Studies — E-Code' },
  { name: 'description', content: 'How teams ship faster with E-Code — customer case studies and results.' },
];

export default function CaseStudiesRoute() {
  return <CaseStudies />;
}
