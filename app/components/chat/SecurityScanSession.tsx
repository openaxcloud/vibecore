import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createSecurityScanSession, type SecurityScanSession } from './security-scan-session';

const Context = createContext<SecurityScanSession | null>(null);

/** Mounted above the loading shells, inside the project/workspace/window key. */
export function SecurityScanSessionProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const session = useMemo(() => createSecurityScanSession(projectId), [projectId]);
  useEffect(() => () => session.dispose(), [session]);

  return <Context.Provider value={session}>{children}</Context.Provider>;
}

export function useSecurityScanSession(projectId?: string, reload?: () => void | Promise<void>) {
  const shared = useContext(Context);
  const local = useMemo(() => createSecurityScanSession(projectId), [projectId]);
  const session = shared && shared.projectId === projectId ? shared : local;
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => () => local.dispose(), [local]);

  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);

  // The active panel refreshes once per outcome; the request never captures a discarded shell's callback.
  useEffect(() => {
    if (reloadRef.current && session.claimRefresh(snapshot.refreshRevision)) {
      try {
        void Promise.resolve(reloadRef.current()).catch((error) =>
          console.error('Security scan results refresh failed', error),
        );
      } catch (error) {
        console.error('Security scan results refresh failed', error);
      }
    }
  }, [session, snapshot.refreshRevision]);

  return { session, snapshot };
}
