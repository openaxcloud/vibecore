import type { LinksFunction, MetaFunction } from 'react-router';
import Changelog from '~/components/marketing/ecode-exact/pages/Changelog';
import { socialMetaTags } from '~/utils/social-meta';

export const meta: MetaFunction = () => [
  { title: 'Changelog — E-Code' },
  { name: 'description', content: 'E-Code changelog — the latest features, improvements and fixes.' },
  ...socialMetaTags({
    path: '/changelog',
    title: 'E-Code Changelog',
    description: 'What is new, improved and fixed on the E-Code platform.',
  }),
];

export const links: LinksFunction = () => [
  { rel: 'alternate', type: 'application/rss+xml', title: 'E-Code Changelog', href: '/changelog.xml' },
];

export default function ChangelogRoute() {
  return <Changelog />;
}
