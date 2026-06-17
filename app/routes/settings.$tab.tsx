import type { MetaFunction } from 'react-router';
import { useNavigate, useParams } from 'react-router';
import { ClientOnly } from 'remix-utils/client-only';
import { ControlPanel } from '~/components/@settings/core/ControlPanel';
import type { TabType } from '~/components/@settings/core/types';
import BackgroundRays from '~/components/ui/BackgroundRays';

const TAB_ALIASES: Record<string, TabType> = {
  profile: 'profile',
  settings: 'settings',
  notifications: 'notifications',
  features: 'features',
  data: 'data',
  'cloud-providers': 'cloud-providers',
  providers: 'cloud-providers',
  'local-providers': 'local-providers',
  local: 'local-providers',
  github: 'github',
  connection: 'connections',
  connections: 'connections',
  gitlab: 'gitlab',
  netlify: 'netlify',
  vercel: 'vercel',
  supabase: 'supabase',
  'event-logs': 'event-logs',
  logs: 'event-logs',
  mcp: 'mcp',
  update: 'update',
  updates: 'update',
  debug: 'debug',
  'task-manager': 'task-manager',
  tasks: 'task-manager',
  'service-status': 'service-status',
  status: 'service-status',
};

export const meta: MetaFunction = ({ params }) => {
  return [{ title: `${params.tab || 'Settings'} | Bolt` }];
};

export default function SettingsTabRoute() {
  const navigate = useNavigate();
  const params = useParams();
  const initialTab = params.tab ? TAB_ALIASES[params.tab] || null : null;

  return (
    <div className="min-h-screen bg-bolt-elements-background-depth-1">
      <BackgroundRays />
      <ClientOnly>{() => <ControlPanel open initialTab={initialTab} onClose={() => navigate('/')} />}</ClientOnly>
    </div>
  );
}
