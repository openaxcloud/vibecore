import type { MetaFunction } from '@remix-run/cloudflare';
import HelpCenter from '~/components/marketing/ecode-exact/pages/HelpCenter';

export const meta: MetaFunction = () => [
  { title: 'Help Center — VibeCore' },
  {
    name: 'description',
    content: 'VibeCore Help Center — guides for workspaces, deployments, billing and the AI agent.',
  },
];

export default function HelpCenterRoute() {
  return <HelpCenter />;
}
