import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { IdeSettingsDraftProvider } from './IdeSettingsDraftState';

type Palette = { paneId: string; query: string } | null;
type Action =
  | { type: 'open'; paneId: string }
  | { type: 'close'; paneId: string }
  | { type: 'query'; paneId: string; query: string }
  | { type: 'retain'; paneIds: readonly string[] };

function reducePalette(state: Palette, action: Action): Palette {
  if (action.type === 'open') {
    return { paneId: action.paneId, query: '' };
  }

  if (action.type === 'retain') {
    return state && !action.paneIds.includes(state.paneId) ? null : state;
  }

  if (!state || state.paneId !== action.paneId) {
    return state;
  }

  return action.type === 'close' ? null : { ...state, query: action.query };
}

const PaletteStateContext = createContext<Palette>(null);
const PaletteDispatchContext = createContext<Dispatch<Action> | undefined>(undefined);

function useGlobalPaletteState() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteMode, setCommandPaletteMode] = useState<'all' | 'tools' | 'files' | 'spotlight'>('all');
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('');
  const [commandPaletteIndex, setCommandPaletteIndex] = useState(0);
  const [spotlightProjectName, setSpotlightProjectName] = useState('');
  const commandPaletteReturnFocusRef = useRef<HTMLElement | null>(null);

  return useMemo(
    () => ({
      commandPaletteOpen,
      setCommandPaletteOpen,
      commandPaletteMode,
      setCommandPaletteMode,
      commandPaletteQuery,
      setCommandPaletteQuery,
      commandPaletteIndex,
      setCommandPaletteIndex,
      spotlightProjectName,
      setSpotlightProjectName,
      commandPaletteReturnFocusRef,
    }),
    [commandPaletteOpen, commandPaletteMode, commandPaletteQuery, commandPaletteIndex, spotlightProjectName],
  );
}

const GlobalPaletteContext = createContext<ReturnType<typeof useGlobalPaletteState> | null>(null);

/** Route-owned command palette; standalone chat callers keep their local lifetime. */
export function useGlobalIdePalette() {
  const shared = useContext(GlobalPaletteContext);
  const local = useGlobalPaletteState();

  return shared ?? local;
}

function ScopedPaletteProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducePalette, null);
  const globalPalette = useGlobalPaletteState();

  return (
    <PaletteDispatchContext.Provider value={dispatch}>
      <PaletteStateContext.Provider value={state}>
        <GlobalPaletteContext.Provider value={globalPalette}>
          <IdeSettingsDraftProvider projectId={projectId}>{children}</IdeSettingsDraftProvider>
        </GlobalPaletteContext.Provider>
      </PaletteStateContext.Provider>
    </PaletteDispatchContext.Provider>
  );
}

/** Lives above the loading shells; leaving the route or changing its scope drops the palette. */
export function IdePaletteProvider({
  projectId,
  windowId,
  children,
}: {
  projectId: string;
  windowId: string;
  children: ReactNode;
}) {
  return (
    <ScopedPaletteProvider projectId={projectId} key={JSON.stringify([projectId, windowId])}>
      {children}
    </ScopedPaletteProvider>
  );
}

/** Other BaseChat callers retain local state without depending on a route provider. */
export function useIdePalette(paneId = 'local') {
  const sharedState = useContext(PaletteStateContext);
  const sharedDispatch = useContext(PaletteDispatchContext);
  const [localState, localDispatch] = useReducer(reducePalette, null);
  const state = sharedDispatch ? sharedState : localState;
  const dispatch = sharedDispatch ?? localDispatch;

  const openPalette = useCallback(() => dispatch({ type: 'open', paneId }), [dispatch, paneId]);
  const closePalette = useCallback(() => dispatch({ type: 'close', paneId }), [dispatch, paneId]);
  const setQuery = useCallback((query: string) => dispatch({ type: 'query', paneId, query }), [dispatch, paneId]);

  return {
    open: state?.paneId === paneId,
    query: state?.paneId === paneId ? state.query : '',
    openPalette,
    closePalette,
    setQuery,
  };
}

/** Prune removed panes after a committed layout, never during a transient shell's unmount. */
export function useRetainIdePalettes(paneIds: readonly string[]) {
  // A search keystroke must not rerender the BaseChat layout owner.
  const dispatch = useContext(PaletteDispatchContext);

  useEffect(() => {
    dispatch?.({ type: 'retain', paneIds });
  }, [dispatch, paneIds]);
}

/** Restore the command opener after explicit close, without stealing an outside click. */
export function useCommandPaletteReturnFocus(
  open: boolean,
  returnFocusRef: MutableRefObject<HTMLElement | null>,
  closedByOutsideClickRef: MutableRefObject<boolean>,
) {
  useEffect(() => {
    if (open) {
      return undefined;
    }

    const previous = returnFocusRef.current;

    if (closedByOutsideClickRef.current) {
      returnFocusRef.current = null;
      closedByOutsideClickRef.current = false;

      return undefined;
    }

    if (!previous) {
      return undefined;
    }

    let cancelled = false;

    const frame = requestAnimationFrame(() => {
      if (cancelled || returnFocusRef.current !== previous) {
        return;
      }

      /*
       * Consume only when this owner actually attempts restoration. A loading
       * shell may unmount before this frame; its same-route successor must be
       * able to resume the shared receipt. A new project has a different ref.
       */
      returnFocusRef.current = null;

      const focused = document.activeElement;

      if (focused && focused !== document.body && focused !== document.documentElement && focused !== previous) {
        return;
      }

      const testId = previous.dataset.testid;

      const replacements =
        !previous.isConnected && testId
          ? Array.from(document.querySelectorAll<HTMLElement>('[data-testid]')).filter(
              (candidate) => candidate.dataset.testid === testId && candidate.getClientRects().length > 0,
            )
          : [];

      const target = previous.isConnected ? previous : replacements.length === 1 ? replacements[0] : undefined;
      target?.focus();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [open, returnFocusRef, closedByOutsideClickRef]);
}
