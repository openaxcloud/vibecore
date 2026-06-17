import type { MetaFunction } from '@remix-run/cloudflare';
import StatusPage from '~/components/marketing/ecode-exact/pages/StatusPage';

export const meta: MetaFunction = () => [
  { title: 'System Status — E-Code' },
  { name: 'description', content: 'E-Code system status and uptime.' },
];

export default function StatusRoute() {
  return <StatusPage />;
}
