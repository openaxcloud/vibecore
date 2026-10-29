import { useDesktopEditorComposing } from '@vibecore/editor';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const fileRowSelector = 'button.bolt-file-tree-node';
const rowPath = (row: HTMLElement) => row.getAttribute('title') ?? row.dataset.vcTitleStash;

/** Finish native composition before replacing the interactive startup shell. */
export function useEditorCompositionHandoff(ready: boolean) {
  const composing = useDesktopEditorComposing();
  const [activated, setActivated] = useState(() => ready && !composing);
  const [pointerActive, setPointerActive] = useState(false);
  const pointers = useRef(new Set<number>());
  const fileFocus = useRef<{ node: HTMLElement; path: string; name: string; url: string }>();

  useBrowserLayoutEffect(() => {
    const previous = fileFocus.current;
    fileFocus.current = undefined;

    if (!activated || !previous || previous.node.isConnected || previous.url !== window.location.href) {
      return;
    }

    const active = document.activeElement;

    // Respect focus deliberately assigned by the new shell or another control.
    if (active && active !== document.body && active.isConnected) {
      return;
    }

    const candidates = [...document.querySelectorAll<HTMLButtonElement>(fileRowSelector)].filter((row) => {
      const visibility = getComputedStyle(row).visibility;
      return (
        !row.disabled &&
        row.getClientRects().length > 0 &&
        visibility !== 'hidden' &&
        visibility !== 'collapse' &&
        rowPath(row) === previous.path &&
        row.querySelector('.bolt-file-tree-name')?.textContent === previous.name
      );
    });

    // Restore only an unambiguous identity during this commit, never replay Enter.
    if (candidates.length === 1) {
      candidates[0].focus({ preventScroll: true });
    }
  }, [activated]);

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
    const timer = setTimeout(() => {
      const node = document.activeElement;

      if (node instanceof HTMLElement && node.matches(fileRowSelector)) {
        const path = rowPath(node);
        const name = node.querySelector('.bolt-file-tree-name')?.textContent;

        if (path && name) {
          fileFocus.current = { node, path, name, url: window.location.href };
        }
      }

      setActivated(true);
    }, 0);

    return () => clearTimeout(timer);
  }, [ready, activated, composing, pointerActive]);

  // Once active, a later composition must never return ChatImpl to its fallback.
  return ready && activated;
}
