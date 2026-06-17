import type { MetaFunction } from 'react-router';
import Collaboration from '~/components/marketing/ecode-exact/pages/Collaboration';

export const meta: MetaFunction = () => [
  { title: 'Collaboration — VibeCore' },
  {
    name: 'description',
    content: 'Real-time collaboration in VibeCore — multiplayer editing, comments, presence and shared workspaces.',
  },
];

export default function CollaborationRoute() {
  return <Collaboration />;
}
