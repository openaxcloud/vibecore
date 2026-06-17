import type { MetaFunction } from 'react-router';
import Press from '~/components/marketing/ecode-exact/pages/Press';
export const meta: MetaFunction = () => [
  { title: 'Press — VibeCore' },
  { name: 'description', content: 'VibeCore press kit, brand assets, and media coverage.' },
];
export default function PressRoute() {
  return <Press />;
}
