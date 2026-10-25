import { useStore } from '@nanostores/react';
import { useCallback, useState } from 'react';
import { deployPanelSessions, updateDeployPanelSession, type DeployPanelSession } from '~/lib/stores/deploy-panel-view';

export function useDeployPanelSession(projectId?: string) {
  const sessions = useStore(deployPanelSessions);
  const [local, setLocal] = useState<DeployPanelSession>({ view: 'overview', domainDraft: '' });

  const update = useCallback(
    (patch: Partial<DeployPanelSession>) => {
      if (projectId) {
        updateDeployPanelSession(projectId, patch);
      } else {
        setLocal((previous) => ({ ...previous, ...patch }));
      }
    },
    [projectId],
  );

  return { session: projectId ? (sessions[projectId] ?? { view: 'overview', domainDraft: '' }) : local, update };
}
