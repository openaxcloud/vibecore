import type { MetaFunction } from 'react-router';
import Tutorials from '~/components/marketing/ecode-exact/pages/Tutorials';

export const meta: MetaFunction = () => [
  { title: 'Tutorials — VibeCore' },
  { name: 'description', content: 'VibeCore tutorials — learn to build, deploy and collaborate with the AI agent.' },
];

export default function TutorialsRoute() {
  return <Tutorials />;
}
