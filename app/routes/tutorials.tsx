import type { MetaFunction } from 'react-router';
import Tutorials from '~/components/marketing/ecode-exact/pages/Tutorials';

export const meta: MetaFunction = () => [
  { title: 'Tutorials — E-Code' },
  { name: 'description', content: 'E-Code tutorials — learn to build, deploy and collaborate with the AI agent.' },
];

export default function TutorialsRoute() {
  return <Tutorials />;
}
