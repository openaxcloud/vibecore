import type { MetaFunction } from 'react-router';
import { useNavigate } from 'react-router';
import { ClientOnly } from 'remix-utils/client-only';
import { ControlPanel } from '~/components/@settings/core/ControlPanel';
import BackgroundRays from '~/components/ui/BackgroundRays';

export const meta: MetaFunction = () => {
  return [{ title: 'Settings - E-Code' }];
};

export default function SettingsRoute() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-bolt-elements-background-depth-1">
      <BackgroundRays />
      <ClientOnly>{() => <ControlPanel open initialTab={null} onClose={() => navigate('/')} />}</ClientOnly>
    </div>
  );
}
