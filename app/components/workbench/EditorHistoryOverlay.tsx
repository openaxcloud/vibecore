import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileHistoryPanel } from './FileHistoryPanel';
import { getWorkspaceMiscCopy } from '~/lib/i18n/catalogs/workspace-misc';

interface EditorHistoryOverlayProps {
  filePath: string;
  content: string;
}

/**
 * Bottom-right "History" toggle plus the standalone File History panel
 * (independent of Git). Rendered inside a `position: relative` editor container;
 * the panel overlays the editor body. Shared by the Workbench editor pane
 * (EditorPanel) and the desktop Project Editor pane so the feature is present at
 * every viewport.
 */
export const EditorHistoryOverlay = memo(({ filePath, content }: EditorHistoryOverlayProps) => {
  const { i18n } = useTranslation();
  const copy = getWorkspaceMiscCopy(i18n.resolvedLanguage ?? i18n.language);
  const [open, setOpen] = useState(false);

  // Close when the open file changes so history always matches what's on screen.
  useEffect(() => {
    setOpen(false);
  }, [filePath]);

  /*
   * The save-conflict notice can open the same recovery surface from either
   * IDE shell. Scope the event to this file so split editors do not all open at
   * once, and keep File History as the single recovery/diff experience.
   */
  useEffect(() => {
    const handleOpenFileHistory = (event: Event) => {
      const requestedPath = (event as CustomEvent<{ filePath?: string }>).detail?.filePath;

      if (requestedPath === filePath) {
        setOpen(true);
      }
    };

    window.addEventListener('vibecore:open-file-history', handleOpenFileHistory);

    return () => window.removeEventListener('vibecore:open-file-history', handleOpenFileHistory);
  }, [filePath]);

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="file-history-open"
          aria-label={copy['workspaceMisc.editorHistory.open.aria']}
          className="absolute bottom-3 right-3 z-20 flex min-h-[44px] items-center gap-1.5 rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3.5 text-sm font-medium text-bolt-elements-textPrimary shadow-md hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
        >
          <div
            className="i-ph:clock-counter-clockwise-duotone text-base text-[var(--vc-ide-accent-action)]"
            aria-hidden
          />
          <span className="min-w-0 break-words text-center leading-tight">
            {copy['workspaceMisc.editorHistory.open.label']}
          </span>
        </button>
      )}

      {open && <FileHistoryPanel filePath={filePath} currentContent={content} onClose={() => setOpen(false)} />}
    </>
  );
});

EditorHistoryOverlay.displayName = 'EditorHistoryOverlay';
