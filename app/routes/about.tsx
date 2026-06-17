import type { MetaFunction } from 'react-router';
import About from '~/components/marketing/ecode-exact/pages/About';
export const meta: MetaFunction = () => [
  { title: 'About — VibeCore' },
  { name: 'description', content: 'About VibeCore — building AI-native software creation for everyone.' },
];
export default function AboutRoute() {
  return <About />;
}
