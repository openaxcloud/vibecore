import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from 'react';
import { useLayoutHandoffEffect } from './ide-layout-handoff';

const regions = [
  'mobile-ide-header',
  'mobile-bottom-navigation',
  'mobile-tab-switcher',
  'tools-sheet',
  'mobile-more-menu-sheet',
  'mobile-agent-menu-sheet',
] as const;
type Control = { region: (typeof regions)[number]; testId: string };
type FocusState = { opener: Control | null; pending: Control | null };

const Context = createContext<RefObject<FocusState> | null>(null);
const TabSearchContext = createContext<[string, Dispatch<SetStateAction<string>>] | null>(null);

function ScopedProvider({ children }: { children: ReactNode }) {
  const state = useRef<FocusState>({ opener: null, pending: null });
  const search = useState('');

  return (
    <Context.Provider value={state}>
      <TabSearchContext.Provider value={search}>{children}</TabSearchContext.Provider>
    </Context.Provider>
  );
}

/** Retain only the current interaction; existing close/open handlers still clear the query. */
export function useMobileTabSearchQuery() {
  const shared = useContext(TabSearchContext);
  const local = useState('');

  return shared ?? local;
}

/** Transient keyboard interaction survives loading shells, never a route scope change. */
export function MobileOverlayFocusProvider({
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

function describe(root: HTMLElement, element: Element | null): Control | null {
  if (!(element instanceof HTMLElement) || !root.contains(element) || !element.dataset.testid) {
    return null;
  }

  const region = regions.find((id) => element.closest(`[data-testid="${id}"]`));

  return region ? { region, testId: element.dataset.testid } : null;
}

function find(root: HTMLElement, control: Control): HTMLElement | undefined {
  return Array.from(root.querySelectorAll<HTMLElement>(`[data-testid="${control.region}"] [data-testid]`)).find(
    (element) => element.dataset.testid === control.testId,
  );
}

export function useMobileOverlayFocus(ready: boolean, mobile: boolean) {
  const shared = useContext(Context);
  const local = useRef<FocusState>({ opener: null, pending: null });
  const state = shared ?? local;
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutHandoffEffect(() => {
    const root = rootRef.current;

    return () => {
      if (root && state.current) {
        const active = document.activeElement;

        // An intermediate shell may not yet have rendered mobile controls.
        if (active !== document.body) {
          state.current.pending = describe(root, active);
        }
      }
    };
  }, [state]);

  // Sheets are restored after hydration; retry on their render, not on a timer.
  useLayoutHandoffEffect(() => {
    const root = rootRef.current;
    const pending = state.current?.pending;

    if (!root || !pending) {
      return;
    }

    if (!mobile && window.innerWidth >= 1200) {
      state.current!.pending = null;
      return;
    }

    if (!ready) {
      return;
    }

    const active = document.activeElement;

    if (active && active !== document.body && active.isConnected) {
      state.current!.pending = null;
      return;
    }

    const target = find(root, pending);

    if (target) {
      state.current!.pending = null;
      target.focus({ preventScroll: true });
    }
  });

  const rememberOpener = useCallback(
    (element: HTMLElement) => {
      const root = rootRef.current;

      if (root && state.current) {
        const control = describe(root, element);

        state.current.opener = control;
        state.current.pending = null;
      }
    },
    [state],
  );
  const restoreOpener = useCallback(() => {
    const root = rootRef.current;
    const opener = state.current?.opener;

    if (root && opener) {
      state.current!.pending = null;
      find(root, opener)?.focus({ preventScroll: true });
    }
  }, [state]);

  return { rootRef, rememberOpener, restoreOpener };
}
