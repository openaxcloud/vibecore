import type { MetaFunction } from 'react-router';
import Languages from '~/components/marketing/ecode-exact/pages/Languages';

export const meta: MetaFunction = () => [
  { title: 'Languages — E-Code' },
  {
    name: 'description',
    content: 'E-Code supports every major programming language — Python, JavaScript, TypeScript, Go, Rust and more.',
  },
];

export default function LanguagesRoute() {
  return <Languages />;
}
