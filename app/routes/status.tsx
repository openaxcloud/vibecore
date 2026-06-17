import type { MetaFunction } from '@remix-run/cloudflare';
import StatusPage from '~/components/marketing/ecode-exact/pages/StatusPage';

export const meta: MetaFunction = () => [
  { title: 'System Status — VibeCore' },
  { name: 'description', content: 'VibeCore system status and uptime.' },
];

export default function StatusRoute() {
  return <StatusPage />;
}
