import type { MetaFunction } from '@remix-run/cloudflare';
import Languages from '~/components/marketing/ecode-exact/pages/Languages';

export const meta: MetaFunction = () => [
  { title: 'Languages — VibeCore' },
  {
    name: 'description',
    content: 'VibeCore supports every major programming language — Python, JavaScript, TypeScript, Go, Rust and more.',
  },
];

export default function LanguagesRoute() {
  return <Languages />;
}
