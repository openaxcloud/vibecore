import type { MetaFunction } from 'react-router';
import CaseStudies from '~/components/marketing/ecode-exact/pages/CaseStudies';

export const meta: MetaFunction = () => [
  { title: 'Case Studies — VibeCore' },
  { name: 'description', content: 'How teams ship faster with VibeCore — customer case studies and results.' },
];

export default function CaseStudiesRoute() {
  return <CaseStudies />;
}
