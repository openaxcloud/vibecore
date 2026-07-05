import type { MetaFunction } from 'react-router';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { WorkspaceSettings } from '~/components/settings/WorkspaceSettings';

export const meta: MetaFunction = () => [{ title: 'Workspace Settings — E-Code' }];

export default function WorkspaceSettingsRoute() {
  return (
    <AppShell title="Workspace settings" description="Editor and workspace preferences." hideHeader>
      <WorkspaceSettings />
    </AppShell>
  );
}
