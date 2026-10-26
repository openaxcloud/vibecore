import type { editor } from 'monaco-editor';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

type Snapshot = { viewState: editor.ICodeEditorViewState; modelUri: string; contents: string };
type Intent = { identity: string; generation: number; snapshot: Snapshot };
type FocusedEditor = { identity: string; hasTextFocus(): boolean; snapshot(): Snapshot | null };
type FocusState = {
  pending: Intent | null;
  generation: number;
  editors: Set<FocusedEditor>;
  composing: Set<object>;
  compositionListeners: Set<() => void>;
};

const focusContext = createContext<FocusState | null>(null);

/** Scope this provider to one project/workspace/window, above interchangeable loading shells. */
function desktopEditorFocusProvider({ children }: { children: ReactNode }) {
  const state = useRef<FocusState>({
    pending: null,
    generation: 0,
    editors: new Set(),
    composing: new Set(),
    compositionListeners: new Set(),
  });

  useEffect(() => {
    const invalidate = () => {
      state.current.generation += 1;
      state.current.pending = null;
    };

    document.addEventListener('focusin', invalidate, true);
    document.addEventListener('pointerdown', invalidate, true);
    document.addEventListener('keydown', invalidate, true);

    return () => {
      invalidate();
      document.removeEventListener('focusin', invalidate, true);
      document.removeEventListener('pointerdown', invalidate, true);
      document.removeEventListener('keydown', invalidate, true);
    };
  }, []);

  return createElement(focusContext.Provider, { value: state.current }, children);
}

export { desktopEditorFocusProvider as DesktopEditorFocusProvider };

export function useDesktopEditorFocus() {
  return useContext(focusContext);
}

/** Native composition activity only; ordinary focus and typing do not delay startup. */
export function useDesktopEditorComposing() {
  const state = useDesktopEditorFocus();

  const subscribe = useCallback(
    (listener: () => void) => {
      state?.compositionListeners.add(listener);

      return () => {
        state?.compositionListeners.delete(listener);
      };
    },
    [state],
  );

  const getSnapshot = useCallback(() => Boolean(state?.composing.size), [state]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function trackDesktopEditorComposition(state: FocusState | null) {
  const token = {};
  const notify = () => state?.compositionListeners.forEach((listener) => listener());

  const end = () => {
    if (state?.composing.delete(token)) {
      notify();
    }
  };

  return {
    start: () => {
      if (state && !state.composing.has(token)) {
        state.composing.add(token);
        notify();
      }
    },
    end,
    dispose: end,
  };
}

function rememberDesktopEditorFocus(state: FocusState, identity: string, snapshot: Snapshot) {
  const intent = { identity, generation: ++state.generation, snapshot };
  state.pending = intent;

  /*
   * Only a replacement mounted in this commit can claim the handoff.
   * Closing a panel must not cause a later visit to focus its editor.
   */
  queueMicrotask(() => {
    if (state.pending === intent) {
      state.pending = null;
    }
  });
}

/** Capture only a shell replacement, never an ordinary tab/editor unmount. */
export function useDesktopEditorFocusHandoff() {
  const state = useDesktopEditorFocus();
  const useHandoffEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

  useHandoffEffect(() => {
    return () => {
      const focused = state && [...state.editors].find((editor) => editor.hasTextFocus());
      const snapshot = focused?.snapshot();

      if (state && focused && snapshot) {
        rememberDesktopEditorFocus(state, focused.identity, snapshot);
      }
    };
  }, [state]);
}

export function registerDesktopEditorFocus(state: FocusState | null, editor: FocusedEditor) {
  state?.editors.add(editor);

  return () => {
    state?.editors.delete(editor);
  };
}

export function claimDesktopEditorFocus(state: FocusState | null, identity: string | undefined) {
  if (!state || !identity || state.pending?.identity !== identity) {
    return null;
  }

  const intent = state.pending;
  state.pending = null;

  return () => {
    const active = document.activeElement;
    return state.generation === intent.generation && (!active || active === document.body || !active.isConnected)
      ? intent.snapshot
      : null;
  };
}
