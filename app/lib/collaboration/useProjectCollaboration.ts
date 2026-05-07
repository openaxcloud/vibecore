import { useEffect, useMemo, useState } from 'react';
import { ProjectCollaborationClient, type CollaborationSnapshot } from './projectCollaborationClient';

export function useProjectCollaboration({
  projectId,
  enabled,
  filePath,
  mode = 'editing',
}: {
  projectId?: string;
  enabled: boolean;
  filePath?: string;
  mode?: 'editing' | 'read-only' | 'pair-programming';
}) {
  const client = useMemo(() => {
    if (!projectId || !enabled) {
      return undefined;
    }

    return new ProjectCollaborationClient({ projectId });
  }, [enabled, projectId]);

  const [snapshot, setSnapshot] = useState<CollaborationSnapshot | undefined>(() => client?.snapshot);

  useEffect(() => {
    if (!client) {
      setSnapshot(undefined);

      return undefined;
    }

    const unsubscribe = client.subscribe(setSnapshot);
    client.connect();

    return () => {
      unsubscribe();
      client.close();
    };
  }, [client]);

  useEffect(() => {
    if (!client || !enabled) {
      return;
    }

    client.updatePresence({
      status: 'online',
      filePath,
      mode,
    });
  }, [client, enabled, filePath, mode]);

  return { client, snapshot };
}
