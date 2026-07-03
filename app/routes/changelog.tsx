import type { LinksFunction, MetaFunction } from 'react-router';
import Changelog from '~/components/marketing/ecode-exact/pages/Changelog';

export const meta: MetaFunction = () => [
  { title: 'Changelog — E-Code' },
  { name: 'description', content: 'E-Code changelog — the latest features, improvements and fixes.' },
];

export const links: LinksFunction = () => [
  { rel: 'alternate', type: 'application/rss+xml', title: 'E-Code Changelog', href: '/changelog.xml' },
];

export default function ChangelogRoute() {
  return <Changelog />;
}
