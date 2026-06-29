import type { MetaFunction } from 'react-router';

import DataDeletion from '~/components/marketing/ecode-exact/pages/DataDeletion';

// In-repo SSR (main Remix app) rather than the prebuilt external marketing bundle.
export const meta: MetaFunction = () => [
  { title: 'Deleting Your Data — E-Code' },
  { name: 'description', content: 'How to delete projects or your E-Code account, and what gets removed.' },
];

export default function DataDeletionRoute() {
  return <DataDeletion />;
}
