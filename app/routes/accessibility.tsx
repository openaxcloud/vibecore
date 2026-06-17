import type { MetaFunction } from 'react-router';
import Accessibility from '~/components/marketing/ecode-exact/pages/Accessibility';

export const meta: MetaFunction = () => [
  { title: 'Accessibility — VibeCore' },
  {
    name: 'description',
    content: 'VibeCore accessibility commitment — WCAG 2.1 AA, assistive tech support and how to report issues.',
  },
];

export default function AccessibilityRoute() {
  return <Accessibility />;
}
