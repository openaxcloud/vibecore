import type { MetaFunction } from 'react-router';
import Changelog from '~/components/marketing/ecode-exact/pages/Changelog';

export const meta: MetaFunction = () => [
  { title: 'Changelog — VibeCore' },
  { name: 'description', content: 'VibeCore changelog — the latest features, improvements and fixes.' },
];

export default function ChangelogRoute() {
  return <Changelog />;
}
