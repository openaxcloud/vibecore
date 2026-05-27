import { useEffect, useState } from 'react';
import { ProjectCollaborationClient, type CollaborationSnapshot } from './projectCollaborationClient';

type SharedCollaborationClient = {
  client: ProjectCollaborationClient;
  references: number;
  closeTimer?: ReturnType<typeof setTimeout>;
};

const sharedClients = new Map<string, SharedCollaborationClient>();

function browserSessionId(projectId: string) {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const key = `vibecore:collaboration-session:${projectId}`;

  try {
    const existing = window.sessionStorage.getItem(key);

    if (existing) {
      return existing;
    }

    const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
    const next = `collab:${random}`;
    window.sessionStorage.setItem(key, next);

    return next;
  } catch {
    const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

    return `collab:${random}`;
  }
}

function acquireSharedClient(projectId: string) {
  let entry = sharedClients.get(projectId);

  if (!entry) {
    entry = {
      client: new ProjectCollaborationClient({ projectId, sessionId: browserSessionId(projectId) }),
      references: 0,
    };
    sharedClients.set(projectId, entry);
  }

  if (entry.closeTimer) {
    clearTimeout(entry.closeTimer);
    entry.closeTimer = undefined;
  }

  entry.references += 1;

  const acquired = entry;

  return {
    client: acquired.client,
    release: () => {
      acquired.references = Math.max(0, acquired.references - 1);

      if (acquired.references > 0) {
        return;
      }

      acquired.closeTimer = setTimeout(() => {
        if (acquired.references > 0) {
          return;
        }

        acquired.client.close();
        sharedClients.delete(projectId);
      }, 250);
    },
  };
}

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
  const [client, setClient] = useState<ProjectCollaborationClient | undefined>();

  const [snapshot, setSnapshot] = useState<CollaborationSnapshot | undefined>(() => client?.snapshot);

  useEffect(() => {
    if (!projectId || !enabled) {
      setClient(undefined);
      setSnapshot(undefined);

      return undefined;
    }

    const shared = acquireSharedClient(projectId);
    setClient(shared.client);

    return shared.release;
  }, [enabled, projectId]);

  useEffect(() => {
    if (!client) {
      return undefined;
    }

    const unsubscribe = client.subscribe(setSnapshot);
    client.connect();

    return () => {
      unsubscribe();
    };
  }, [client]);

  useEffect(() => {
    if (!client || !enabled) {
      return;
    }

    client.updatePresence({
      status: 'online',
      ...(filePath ? { filePath } : {}),
      mode,
    });
  }, [client, enabled, filePath, mode]);

  return { client, snapshot };
}
