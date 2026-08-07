import type { MetaFunction } from 'react-router';
import { useNavigate, useParams } from 'react-router';
import { ClientOnly } from 'remix-utils/client-only';
import { ControlPanel } from '~/components/@settings/core/ControlPanel';
import { closeSettingsOverlay } from '~/lib/settings-navigation';
import { TAB_ALIASES, settingsTabTitle } from '~/lib/settings-tab-title';

export const meta: MetaFunction = ({ params, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;

  return [{ title: settingsTabTitle(params.tab, rootData?.language) }];
};

export default function SettingsTabRoute() {
  const navigate = useNavigate();
  const params = useParams();
  const initialTab = params.tab ? TAB_ALIASES[params.tab] || null : null;

  return (
    <div className="min-h-screen bg-bolt-elements-background-depth-1">
      <ClientOnly>
        {() => <ControlPanel open initialTab={initialTab} onClose={() => closeSettingsOverlay(navigate)} />}
      </ClientOnly>
    </div>
  );
}
