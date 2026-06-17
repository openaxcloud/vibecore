import type { MetaFunction } from '@remix-run/cloudflare';
import Changelog from '~/components/marketing/ecode-exact/pages/Changelog';

export const meta: MetaFunction = () => [
  { title: 'Changelog — E-Code' },
  { name: 'description', content: 'E-Code changelog — the latest features, improvements and fixes.' },
];

export default function ChangelogRoute() {
  return <Changelog />;
}
