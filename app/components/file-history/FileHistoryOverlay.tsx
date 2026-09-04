import { useCallback, useEffect, useRef, useState } from 'react';
import { FileHistoryPanel } from './FileHistoryPanel';
import { FileHistoryTrigger } from './FileHistoryTrigger';
import { PanelErrorBoundary } from '~/components/ui/PanelBoundary';
import type { FileHistoryClient } from '~/lib/file-history/client';
import type { FileHistoryRestoredValue } from '~/lib/file-history/useFileHistory';
import '~/styles/file-history.scss';

interface CapturedFileHistoryTarget {
  projectId: string;
  workspaceId: string;
  filePath: string;
  key: string;
}

export interface FileHistoryOverlayProps {
  projectId?: string;
  workspaceId?: string;
  filePath?: string;
  isBinary?: boolean;
  restoreDisabled?: boolean;
  restoreDisabledReason?: string;
  client?: FileHistoryClient;
  onRestoredContent: (filePath: string, content: string) => void | Promise<void>;
}

export function FileHistoryOverlay({
  projectId,
  workspaceId,
  filePath,
  isBinary,
  restoreDisabled,
  restoreDisabledReason,
  client,
  onRestoredContent,
}: FileHistoryOverlayProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement>();
  const [target, setTarget] = useState<CapturedFileHistoryTarget>();
  const liveKey = projectId && workspaceId && filePath ? `${projectId}:${workspaceId}:${filePath}` : undefined;
  const eligible = Boolean(liveKey && !isBinary);

  const close = useCallback(() => {
    setTarget(undefined);

    window.requestAnimationFrame(() => {
      const previous = restoreFocusRef.current;
      const focusTarget = previous?.isConnected ? previous : triggerRef.current;

      focusTarget?.focus();
      restoreFocusRef.current = undefined;
    });
  }, []);

  useEffect(() => {
    if (target && target.key !== liveKey) {
      close();
    }
  }, [close, liveKey, target]);

  useEffect(() => {
    const overlay = overlayRef.current;

    if (!target || !overlay) {
      return undefined;
    }

    const restoreBackground = isolateModalBackground(overlay);

    const focusFrame = window.requestAnimationFrame(() => {
      if (!overlay.contains(document.activeElement)) {
        const firstFocusable = getFocusableElements(overlay)[0];

        if (firstFocusable) {
          firstFocusable.focus();
        } else {
          overlay.focus();
        }
      }
    });

    const handleModalKeyboard = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || isInsideNestedDialog(event.target, overlay)) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        close();

        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusable = getFocusableElements(overlay);

      if (focusable.length === 0) {
        event.preventDefault();
        overlay.focus();

        return;
      }

      const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const movingBeforeStart = event.shiftKey && activeIndex <= 0;
      const movingPastEnd = !event.shiftKey && (activeIndex === -1 || activeIndex === focusable.length - 1);

      if (movingBeforeStart || movingPastEnd) {
        event.preventDefault();
        focusable[event.shiftKey ? focusable.length - 1 : 0]?.focus();
      }
    };

    const keepFocusInsideModal = (event: FocusEvent) => {
      if (overlay.contains(event.target as Node) || isInsideNestedDialog(event.target, overlay)) {
        return;
      }

      const firstFocusable = getFocusableElements(overlay)[0];

      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        overlay.focus();
      }
    };

    document.addEventListener('keydown', handleModalKeyboard);
    document.addEventListener('focusin', keepFocusInsideModal);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleModalKeyboard);
      document.removeEventListener('focusin', keepFocusInsideModal);
      restoreBackground();
    };
  }, [close, target]);

  const open = () => {
    if (!projectId || !workspaceId || !filePath) {
      return;
    }

    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    setTarget({
      projectId,
      workspaceId,
      filePath,
      key: `${projectId}:${workspaceId}:${filePath}`,
    });
  };

  return (
    <>
      {eligible && !target ? <FileHistoryTrigger ref={triggerRef} onClick={open} /> : null}
      {target ? (
        <div
          ref={overlayRef}
          className="vc-file-history-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="File History"
          tabIndex={-1}
          data-testid="file-history-overlay"
        >
          {/* Kept outside the panel boundary so a crashed panel can always be dismissed. */}
          <button
            type="button"
            className="vc-file-history-close focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-focus-ring)]"
            style={{ position: 'absolute', right: 10, top: 9, zIndex: 100 }}
            onClick={close}
            aria-label="Close file history"
          >
            <span className="i-ph:x" aria-hidden />
          </button>
          <PanelErrorBoundary
            panel="File History"
            boundaryId={`project:${target.projectId}:file-history`}
            projectId={target.projectId}
            getSnapshot={() => ({
              workspaceId: target.workspaceId,
              filePath: target.filePath,
              targetKey: target.key,
            })}
          >
            <FileHistoryPanel
              key={target.key}
              projectId={target.projectId}
              workspaceId={target.workspaceId}
              filePath={target.filePath}
              client={client}
              restoreDisabled={restoreDisabled}
              restoreDisabledReason={restoreDisabledReason}
              embeddedInModal
              showCloseButton={false}
              onClose={close}
              onRestored={(value: FileHistoryRestoredValue) => onRestoredContent(target.filePath, value.content)}
            />
          </PanelErrorBoundary>
        </div>
      ) : null}
    </>
  );
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true' && !element.closest('[inert]'),
  );
}

function isInsideNestedDialog(target: EventTarget | null, overlay: HTMLElement): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  const dialog = target.closest('[role="dialog"]');

  return dialog instanceof HTMLElement && dialog !== overlay && !overlay.contains(dialog);
}

/**
 * Isolate every sibling between the editor-local overlay and `document.body`.
 * This keeps the implementation self-contained while providing the same
 * interaction and accessibility guarantees as a body-level modal portal.
 */
function isolateModalBackground(modal: HTMLElement): () => void {
  const previous = new Map<HTMLElement, { ariaHidden: string | null; inert: boolean }>();

  let activeBranch: HTMLElement = modal;
  let parent = activeBranch.parentElement;

  while (parent) {
    for (const sibling of parent.children) {
      if (!(sibling instanceof HTMLElement) || sibling === activeBranch || previous.has(sibling)) {
        continue;
      }

      previous.set(sibling, {
        ariaHidden: sibling.getAttribute('aria-hidden'),
        inert: sibling.inert,
      });
      sibling.inert = true;
      sibling.setAttribute('aria-hidden', 'true');
    }

    if (parent === document.body) {
      break;
    }

    activeBranch = parent;
    parent = parent.parentElement;
  }

  return () => {
    for (const [element, state] of previous) {
      element.inert = state.inert;

      if (state.ariaHidden === null) {
        element.removeAttribute('aria-hidden');
      } else {
        element.setAttribute('aria-hidden', state.ariaHidden);
      }
    }
  };
}
