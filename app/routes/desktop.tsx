import type { MetaFunction } from '@remix-run/cloudflare';
import Desktop from '~/components/marketing/ecode-exact/pages/Desktop';

export const meta: MetaFunction = () => [
  { title: 'Desktop App — E-Code' },
  { name: 'description', content: 'The E-Code desktop app for macOS, Windows and Linux.' },
];

export default function DesktopRoute() {
  return <Desktop />;
}
