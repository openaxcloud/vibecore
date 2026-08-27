import type { MetaFunction } from 'react-router';
import { useNavigate } from 'react-router';
import { ClientOnly } from 'remix-utils/client-only';
import { ControlPanel } from '~/components/@settings/core/ControlPanel';
import { buildRemainingRouteMeta, getRemainingRouteShellsCopy } from '~/lib/i18n/catalogs/remaining-route-shells';
import { closeSettingsOverlay } from '~/lib/settings-navigation';

export const meta: MetaFunction = ({ matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const copy = getRemainingRouteShellsCopy(rootData?.language);

  return buildRemainingRouteMeta({
    title: copy['remainingRoutes.settings.title'],
    description: copy['remainingRoutes.settings.description'],
    path: '/settings',
    language: rootData?.language,
    noindex: true,
  });
};

export default function SettingsRoute() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-bolt-elements-background-depth-1">
      <ClientOnly>
        {() => <ControlPanel open asPage initialTab={null} onClose={() => closeSettingsOverlay(navigate)} />}
      </ClientOnly>
    </div>
  );
}
