import type { MetaFunction } from 'react-router';
import HelpCenter from '~/components/marketing/ecode-exact/pages/HelpCenter';

export const meta: MetaFunction = () => [
  { title: 'Help Center — E-Code' },
  {
    name: 'description',
    content: 'E-Code Help Center — guides for workspaces, deployments, billing and the AI agent.',
  },
];

export default function HelpCenterRoute() {
  return <HelpCenter />;
}
