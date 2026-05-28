import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';

export interface CurrentWorkspaceSummary {
  id: string;
  name?: string;
  status?: string;
  runtimeMode?: string;
  createdAt?: string;
  gitRepositoryUrl?: string | null;
}

export interface CurrentWorkspaceContextValue {
  /*
   * The workspace the IDE is currently scoped to. Resolves in priority order:
   * ?workspace= query param > primary (oldest) workspace > undefined when the
   * project has no workspaces yet (legacy state).
   */
  currentWorkspaceId?: string;

  /*
   * The primary (oldest) workspace id. Used when a panel needs the canonical
   * workspace independently of the user's current selection (e.g. to label
   * the active workspace as "primary").
   */
  primaryWorkspaceId?: string;
  workspaces: CurrentWorkspaceSummary[];
}

const CurrentWorkspaceContext = createContext<CurrentWorkspaceContextValue | undefined>(undefined);

export interface CurrentWorkspaceProviderProps extends PropsWithChildren {
  currentWorkspaceId?: string;
  primaryWorkspaceId?: string;
  workspaces?: CurrentWorkspaceSummary[];
}

export function CurrentWorkspaceProvider({
  currentWorkspaceId,
  primaryWorkspaceId,
  workspaces,
  children,
}: CurrentWorkspaceProviderProps) {
  const value = useMemo<CurrentWorkspaceContextValue>(
    () => ({
      currentWorkspaceId,
      primaryWorkspaceId,
      workspaces: workspaces ?? [],
    }),
    [currentWorkspaceId, primaryWorkspaceId, workspaces],
  );

  return <CurrentWorkspaceContext.Provider value={value}>{children}</CurrentWorkspaceContext.Provider>;
}

export function useCurrentWorkspace(): CurrentWorkspaceContextValue {
  const value = useContext(CurrentWorkspaceContext);

  if (!value) {
    return { workspaces: [] };
  }

  return value;
}

export function useCurrentWorkspaceId(): string | undefined {
  return useCurrentWorkspace().currentWorkspaceId;
}
