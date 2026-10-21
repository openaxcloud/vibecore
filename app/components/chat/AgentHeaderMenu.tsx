import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { HeaderOverflowMenu, type HeaderOverflowMenuProps } from './HeaderOverflowMenu';

type MenuState = { open: boolean; focusedIndex: number };

const initialState: MenuState = { open: false, focusedIndex: 0 };
const Context = createContext<[MenuState, Dispatch<SetStateAction<MenuState>>] | undefined>(undefined);

function ScopedProvider({ children }: { children: ReactNode }) {
  const state = useState(initialState);

  return <Context.Provider value={state}>{children}</Context.Provider>;
}

/** Keep transient interaction above the loading shells, never across route scopes. */
export function AgentMenuProvider({
  projectId,
  workspaceId,
  windowId,
  children,
}: {
  projectId: string;
  workspaceId?: string;
  windowId: string;
  children: ReactNode;
}) {
  return <ScopedProvider key={JSON.stringify([projectId, workspaceId, windowId])}>{children}</ScopedProvider>;
}

/** Subscribe here so moving keyboard focus does not rerender the whole IDE. */
export function AgentHeaderMenu(props: HeaderOverflowMenuProps) {
  const shared = useContext(Context);
  const local = useState(initialState);
  const [state, setState] = shared ?? local;

  return <HeaderOverflowMenu {...props} state={state} onStateChange={setState} />;
}
