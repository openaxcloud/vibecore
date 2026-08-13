import type { MetaFunction } from 'react-router';
import Collaboration from '~/components/marketing/ecode-exact/pages/Collaboration';

export const meta: MetaFunction = () => [
  { title: 'Collaboration — E-Code' },
  {
    name: 'description',
    content: 'Real-time collaboration in E-Code — multiplayer editing, comments, presence and shared workspaces.',
  },
];

export default function CollaborationRoute() {
  return <Collaboration />;
}
