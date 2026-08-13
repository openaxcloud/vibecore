import type { MetaFunction } from 'react-router';
import Forum from '~/components/marketing/ecode-exact/pages/Forum';
export const meta: MetaFunction = () => [
  { title: 'Community Forum — E-Code' },
  { name: 'description', content: 'The E-Code community forum — get help, share projects and request features.' },
];
export default function ForumRoute() {
  return <Forum />;
}
