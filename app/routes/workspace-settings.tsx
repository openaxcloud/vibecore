import type { MetaFunction } from 'react-router';
import { WorkspaceSettings } from '~/components/settings/WorkspaceSettings';

export const meta: MetaFunction = () => [{ title: 'Workspace Settings — E-Code' }];

export default function WorkspaceSettingsRoute() {
  return <WorkspaceSettings />;
}
