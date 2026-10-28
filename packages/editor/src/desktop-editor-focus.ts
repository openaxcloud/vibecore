import type { editor } from 'monaco-editor';
import {
  createContext,
  createElement,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

export interface PortableEditorSelection {
  filePath: string;
  ranges: Array<{ anchor: number; head: number }>;
  mainIndex: number;
}
type Snapshot = {
  viewState?: editor.ICodeEditorViewState;
  modelUri?: string;
  contents: string;
  portable?: PortableEditorSelection;
};

export function portableSelectionForDocument(
  snapshot: Snapshot | null | undefined,
  filePath: string | undefined,
  contents: string,
) {
  const selection = snapshot?.portable;

  if (
    !selection ||
    selection.filePath !== filePath ||
    snapshot.contents !== contents ||
    !selection.ranges.length ||
    !Number.isInteger(selection.mainIndex) ||
    selection.mainIndex < 0 ||
    selection.mainIndex >= selection.ranges.length ||
    selection.ranges.some(
      ({ anchor, head }) =>
        !Number.isInteger(anchor) ||
        !Number.isInteger(head) ||
        Math.min(anchor, head) < 0 ||
        Math.max(anchor, head) > contents.length,
    )
  ) {
    return null;
  }

  return selection;
}
type Intent = { identity: string; generation: number; snapshot: Snapshot };
type FocusedEditor = { identity: string; hasTextFocus(): boolean; snapshot(): Snapshot | null };
type Reservation = { identity: string; restore: (() => Snapshot | null) | null };
type FocusState = {
  reservations: Set<Reservation>;
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
    reservations: new Set(),
    generation: 0,
    editors: new Set(),
    composing: new Set(),
    compositionListeners: new Set(),
  });

  useEffect(() => {
    const invalidate = () => {
      state.current.generation += 1;
      state.current.pending = null;
      state.current.reservations.forEach((reservation) => {
        reservation.restore = null;
      });
      state.current.reservations.clear();
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

      if (state && !state.composing.size && focused && snapshot) {
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
  if (!state || !identity) {
    return null;
  }

  if (state.pending?.identity !== identity) {
    const reservation = [...state.reservations].find((entry) => entry.identity === identity && entry.restore);

    if (!reservation) {
      return null;
    }

    const restore = reservation.restore;
    reservation.restore = null;
    state.reservations.delete(reservation);

    return restore;
  }

  const intent = state.pending;
  state.pending = null;

  return () => {
    const active = document.activeElement;
    return !state.composing.size &&
      state.generation === intent.generation &&
      (!active || active === document.body || !active.isConnected)
      ? intent.snapshot
      : null;
  };
}

/** The keyed engine boundary captures before its focused editor is disposed. */
export function useEditorEngineFocusHandoff(identity: string | undefined) {
  const state = useDesktopEditorFocus();
  const identityRef = useRef(identity);
  const useHandoffEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
  useHandoffEffect(() => {
    identityRef.current = identity;
  });
  useHandoffEffect(
    () => () => {
      if (!state || !identityRef.current || state.composing.size) {
        return;
      }

      const focused = [...state.editors].find(
        (entry) => entry.identity === identityRef.current && entry.hasTextFocus(),
      );

      const snapshot = focused?.snapshot();

      if (focused && snapshot) {
        rememberDesktopEditorFocus(state, focused.identity, snapshot);
      }
    },
    [state],
  );
}

/** A committed destination owns a one-shot handoff while its editor module is loading. */
function editorFocusHandoffBoundary({ identity, children }: { identity?: string; children: ReactNode }) {
  const state = useDesktopEditorFocus();
  const held = useRef<{ state: FocusState; reservation: Reservation }>();
  const useHandoffEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
  useHandoffEffect(() => {
    const previous = held.current;

    if (!state || !identity) {
      if (previous) {
        previous.reservation.restore = null;
      }

      held.current = undefined;

      return;
    }

    if (previous && (previous.state !== state || previous.reservation.identity !== identity)) {
      previous.reservation.restore = null;
    }

    const reservation =
      previous?.state === state && previous.reservation.identity === identity
        ? previous.reservation
        : { identity, restore: claimDesktopEditorFocus(state, identity) };
    held.current = { state, reservation };

    if (!reservation.restore) {
      return;
    }

    state.reservations.add(reservation);

    return () => {
      state.reservations.delete(reservation);
    };
  }, [state, identity]);

  return createElement(Fragment, null, children);
}
export { editorFocusHandoffBoundary as EditorFocusHandoffBoundary };
