import { useDesktopEditorComposing } from '@vibecore/editor';
import { useEffect, useRef, useState } from 'react';

/** Finish native composition before replacing the interactive startup shell. */
export function useEditorCompositionHandoff(ready: boolean) {
  const composing = useDesktopEditorComposing();
  const [activated, setActivated] = useState(() => ready && !composing);
  const [pointerActive, setPointerActive] = useState(false);
  const pointers = useRef(new Set<number>());

  useEffect(() => {
    if (activated) {
      return undefined;
    }

    let releaseTimer: ReturnType<typeof setTimeout> | undefined;

    const begin = (event: PointerEvent) => {
      clearTimeout(releaseTimer);
      pointers.current.add(event.pointerId);
      setPointerActive(true);
    };
    const finish = (event?: PointerEvent) => {
      if (event) {
        pointers.current.delete(event.pointerId);
      } else {
        pointers.current.clear();
      }

      // Let the target's click handler complete before replacing its shell.
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(() => setPointerActive(pointers.current.size > 0), 0);
    };

    const blur = () => finish();

    document.addEventListener('pointerdown', begin, true);
    document.addEventListener('pointerup', finish, true);
    document.addEventListener('pointercancel', finish, true);
    window.addEventListener('blur', blur);

    return () => {
      clearTimeout(releaseTimer);
      document.removeEventListener('pointerdown', begin, true);
      document.removeEventListener('pointerup', finish, true);
      document.removeEventListener('pointercancel', finish, true);
      window.removeEventListener('blur', blur);
    };
  }, [activated]);

  useEffect(() => {
    if (!ready || activated || composing || pointerActive) {
      return undefined;
    }

    // A task boundary lets the final native input and its model update finish.
    const timer = setTimeout(() => setActivated(true), 0);

    return () => clearTimeout(timer);
  }, [ready, activated, composing, pointerActive]);

  // Once active, a later composition must never return ChatImpl to its fallback.
  return ready && activated;
}
