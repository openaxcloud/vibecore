import { useStore } from '@nanostores/react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { computeInlineDiff, type InlineDiff as InlineDiffData } from './file-history-diff';
import {
  fileHistorySourceLabel,
  formatFileHistoryCopy,
  formatFileHistoryNumber,
  formatFileHistoryTimestamp,
  getFileHistoryCopy,
  resolveFileHistoryLanguage,
} from '~/lib/i18n/catalogs/file-history';
import { fileHistoryStore } from '~/lib/stores/fileHistory';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';

interface FileHistoryPanelProps {
  filePath: string;
  currentContent: string;
  onClose: () => void;
}

const PLAYBACK_SPEEDS = [0.5, 1, 2, 4] as const;
const PLAYBACK_BASE_INTERVAL_MS = 900;

type ViewMode = 'version' | 'compare';

export const FileHistoryPanel = memo(({ filePath, currentContent, onClose }: FileHistoryPanelProps) => {
  const { i18n } = useTranslation();
  const language = resolveFileHistoryLanguage(i18n?.resolvedLanguage ?? i18n?.language);
  const copy = getFileHistoryCopy(language);
  const activeFilePath = useStore(fileHistoryStore.activeFilePath);
  const versions = useStore(fileHistoryStore.versions);
  const status = useStore(fileHistoryStore.status);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('version');
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof PLAYBACK_SPEEDS)[number]>(1);
  const [restoring, setRestoring] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  // Always-fresh view of the editor content, without retriggering the load effect.
  const currentContentRef = useRef(currentContent);
  currentContentRef.current = currentContent;

  const isActiveFile = activeFilePath === filePath;
  const ready = status === 'ready' && isActiveFile;
  const versionCount = versions.length;

  // Load history for this file when the panel opens / the file changes.
  useEffect(() => {
    previouslyFocused.current = document.activeElement;

    // currentContent is intentionally read once at open time (baseline), not tracked.
    void fileHistoryStore.open(filePath, currentContentRef.current);
  }, [filePath]);

  // Focus the panel for keyboard nav; restore focus on unmount.
  useEffect(() => {
    rootRef.current?.focus();

    return () => {
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
    };
  }, []);

  // Keep the selected index in range and pinned to the latest on (re)load.
  useEffect(() => {
    if (versionCount === 0) {
      setSelectedIndex(0);

      return;
    }

    setSelectedIndex((current) => Math.min(current, versionCount - 1));
  }, [versionCount]);

  /*
   * Open on the newest version, like Replit. The versions may already be cached
   * in the store from a previous open (so the "list grows" effect below won't
   * fire), so pin to latest once, the first time versions are available for this
   * file — otherwise a re-open lands on the oldest version.
   */
  const pinnedForFileRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (versionCount > 0 && pinnedForFileRef.current !== filePath) {
      pinnedForFileRef.current = filePath;
      setSelectedIndex(versionCount - 1);
    }
  }, [versionCount, filePath]);

  /*
   * When a new version is captured (e.g. a save while the panel is open), the
   * list grows — follow it to the newest unless the user is mid-playback.
   */
  const lastCountRef = useRef(versionCount);
  useEffect(() => {
    if (versionCount > lastCountRef.current && !isPlaying) {
      setSelectedIndex(versionCount - 1);
    }

    lastCountRef.current = versionCount;
  }, [versionCount, isPlaying]);

  const selectedVersion = versions[selectedIndex];
  const latestVersion = versions[versionCount - 1];
  const isLatestSelected = selectedIndex === versionCount - 1;

  const goTo = useCallback(
    (index: number) => {
      const max = Math.max(0, versionCount - 1);
      setSelectedIndex(Math.min(Math.max(index, 0), max));
    },
    [versionCount],
  );

  const goPrev = useCallback(() => goTo(selectedIndex - 1), [goTo, selectedIndex]);
  const goNext = useCallback(() => goTo(selectedIndex + 1), [goTo, selectedIndex]);

  // Playback: advance one version per tick, stop at the end.
  useEffect(() => {
    if (!isPlaying) {
      return undefined;
    }

    if (selectedIndex >= versionCount - 1) {
      setIsPlaying(false);

      return undefined;
    }

    const interval = window.setInterval(() => {
      setSelectedIndex((current) => {
        if (current >= versionCount - 1) {
          setIsPlaying(false);

          return current;
        }

        return current + 1;
      });
    }, PLAYBACK_BASE_INTERVAL_MS / speed);

    return () => window.clearInterval(interval);
  }, [isPlaying, speed, versionCount, selectedIndex]);

  const togglePlayback = useCallback(() => {
    setViewMode('version');
    setIsPlaying((playing) => {
      if (playing) {
        return false;
      }

      // Restart from the beginning if we're already at the end.
      if (selectedIndex >= versionCount - 1) {
        setSelectedIndex(0);
      }

      return true;
    });
  }, [selectedIndex, versionCount]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();

        return;
      }

      const target = event.target as HTMLElement;

      // Let range/select inputs handle their own arrow keys.
      if (target.tagName === 'SELECT') {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setIsPlaying(false);
        goPrev();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setIsPlaying(false);
        goNext();
      }
    },
    [goNext, goPrev, onClose],
  );

  /*
   * The history surface is modal, but keyboard focus is not forcibly trapped:
   * Monaco, a split editor, or a screen-reader virtual cursor can still own the
   * focused node while the overlay is visible. A React handler on the panel
   * therefore cannot be the only Escape path. Listen at window capture while
   * this mounted (open) panel exists so Escape always closes the top modal and
   * cannot fall through to unrelated IDE shortcuts such as stopping an agent
   * run. Arrow-key navigation remains scoped to the panel above.
   */
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    window.addEventListener('keydown', closeOnEscape, true);

    return () => window.removeEventListener('keydown', closeOnEscape, true);
  }, [onClose]);

  const handleRestore = useCallback(async () => {
    if (!selectedVersion) {
      return;
    }

    setRestoring(true);

    try {
      await workbenchStore.restoreFileVersion(filePath, selectedVersion.content, selectedVersion.seq);
    } finally {
      setRestoring(false);
    }
  }, [filePath, selectedVersion]);

  const diff = useMemo(() => {
    if (viewMode !== 'compare' || !selectedVersion || !latestVersion) {
      return undefined;
    }

    return computeInlineDiff(selectedVersion.content, latestVersion.content);
  }, [viewMode, selectedVersion, latestVersion]);

  const fileName = filePath.split('/').pop() ?? filePath;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={formatFileHistoryCopy(copy['fileHistory.dialogLabel'], { fileName })}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      data-testid="file-history-panel"
      className="absolute inset-0 z-40 flex min-w-0 flex-col overflow-x-hidden bg-bolt-elements-background-depth-1 focus:outline-none"
      style={{
        /*
         * Bulletproof opacity: an explicit solid fill + its own stacking context
         * so the editor (Monaco and its GPU scroll layers) can never bleed
         * through the panel while it is mounting.
         */
        background: 'var(--bolt-elements-background-depth-1, #0e1525)',
        isolation: 'isolate',
      }}
    >
      {/* Header */}
      <div className="flex min-w-0 items-start gap-2 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2">
        <div className="i-ph:clock-counter-clockwise-duotone text-lg text-[var(--vc-ide-accent-action)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="break-words text-sm font-semibold text-bolt-elements-textPrimary">
            {formatFileHistoryCopy(copy['fileHistory.title'], { fileName })}
          </div>
          <div className="break-words text-xs text-bolt-elements-textTertiary">{copy['fileHistory.subtitle']}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={copy['fileHistory.close']}
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
        >
          <div className="i-ph:x text-lg" aria-hidden />
        </button>
      </div>

      {/* Body */}
      {status === 'loading' && !ready ? (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-bolt-elements-textSecondary"
          data-testid="file-history-loading"
          role="status"
          aria-live="polite"
        >
          <div className="i-svg-spinners:90-ring-with-bg text-2xl text-[var(--vc-ide-accent-action)]" aria-hidden />
          {copy['fileHistory.loading']}
        </div>
      ) : status === 'error' ? (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-bolt-elements-textSecondary"
          data-testid="file-history-error"
          role="alert"
        >
          <div className="i-ph:warning-circle-duotone text-3xl text-[var(--status-error-text)]" aria-hidden />
          <div>{copy['fileHistory.error']}</div>
          <button
            type="button"
            onClick={() => void fileHistoryStore.retry(currentContent)}
            className="flex min-h-[44px] items-center gap-2 rounded-md border border-bolt-elements-borderColor px-4 py-2 font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
          >
            <div className="i-ph:arrow-clockwise" aria-hidden />
            {copy['fileHistory.retry']}
          </button>
        </div>
      ) : versionCount === 0 ? (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-bolt-elements-textSecondary"
          data-testid="file-history-empty"
        >
          <div className="i-ph:clock-counter-clockwise text-3xl text-bolt-elements-textTertiary" aria-hidden />
          {copy['fileHistory.empty']}
        </div>
      ) : (
        <>
          {/* Content viewport */}
          <div className="min-h-0 flex-1 overflow-auto modern-scrollbar" data-testid="file-history-viewport">
            {viewMode === 'compare' && diff ? (
              <InlineDiff diff={diff} identicalCopy={copy['fileHistory.identical']} />
            ) : (
              <pre className="m-0 whitespace-pre-wrap break-words px-4 py-3 font-mono text-xs leading-relaxed text-bolt-elements-textPrimary">
                {selectedVersion?.content ?? ''}
              </pre>
            )}
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs">
            <div
              className="flex min-w-0 flex-wrap items-center gap-2 text-bolt-elements-textSecondary"
              data-testid="file-history-meta"
            >
              <span className="rounded-full bg-bolt-elements-background-depth-3 px-2 py-0.5 font-medium text-bolt-elements-textPrimary">
                {formatFileHistoryCopy(copy['fileHistory.versionCounter'], {
                  current: formatFileHistoryNumber(selectedIndex + 1, language),
                  total: formatFileHistoryNumber(versionCount, language),
                })}
              </span>
              {selectedVersion && (
                <>
                  <span className="rounded-full border border-bolt-elements-borderColor px-2 py-0.5">
                    {fileHistorySourceLabel(selectedVersion.source, copy)}
                  </span>
                  <span>
                    {formatFileHistoryTimestamp(selectedVersion.createdAt, language) ??
                      copy['fileHistory.dateUnavailable']}
                  </span>
                  {isLatestSelected && (
                    <span className="text-[var(--vc-ide-accent-action)]">{copy['fileHistory.latest']}</span>
                  )}
                </>
              )}
            </div>
            {viewMode === 'compare' && diff && (
              <div className="flex items-center gap-2 font-medium" data-testid="file-history-diffstat">
                <span className="text-[var(--status-success-text)]">+{diff.added}</span>
                <span className="text-[var(--status-error-text)]">−{diff.removed}</span>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-2 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2">
            {/* Navigation: prev · slider · next */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  goPrev();
                }}
                disabled={selectedIndex === 0}
                aria-label={copy['fileHistory.previous']}
                className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 disabled:opacity-40 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
              >
                <div className="i-ph:caret-left-bold" aria-hidden />
              </button>

              <input
                type="range"
                min={0}
                max={Math.max(0, versionCount - 1)}
                step={1}
                value={selectedIndex}
                onChange={(event) => {
                  setIsPlaying(false);
                  goTo(Number(event.target.value));
                }}
                aria-label={copy['fileHistory.slider']}
                aria-valuetext={formatFileHistoryCopy(copy['fileHistory.versionValue'], {
                  current: formatFileHistoryNumber(selectedIndex + 1, language),
                  total: formatFileHistoryNumber(versionCount, language),
                })}
                data-testid="file-history-slider"
                className="vc-file-history-slider min-h-[44px] min-w-0 flex-1 cursor-pointer"
              />

              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  goNext();
                }}
                disabled={isLatestSelected}
                aria-label={copy['fileHistory.next']}
                className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 disabled:opacity-40 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
              >
                <div className="i-ph:caret-right-bold" aria-hidden />
              </button>
            </div>

            {/* Playback + actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={togglePlayback}
                aria-label={isPlaying ? copy['fileHistory.pausePlayback'] : copy['fileHistory.playHistory']}
                aria-pressed={isPlaying}
                data-testid="file-history-play"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-md bg-[var(--vc-ide-accent-action)] px-3 font-medium text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--vc-ide-accent-action)]"
              >
                <div className={isPlaying ? 'i-ph:pause-fill' : 'i-ph:play-fill'} aria-hidden />
                {isPlaying ? copy['fileHistory.pause'] : copy['fileHistory.play']}
              </button>

              <label className="flex min-h-[44px] min-w-0 items-center gap-1 rounded-md border border-bolt-elements-borderColor px-2 text-xs text-bolt-elements-textSecondary">
                <span className="sr-only">{copy['fileHistory.playbackSpeed']}</span>
                <div className="i-ph:gauge" aria-hidden />
                <select
                  value={speed}
                  onChange={(event) => setSpeed(Number(event.target.value) as (typeof PLAYBACK_SPEEDS)[number])}
                  aria-label={copy['fileHistory.playbackSpeed']}
                  data-testid="file-history-speed"
                  className="cursor-pointer bg-transparent py-1 text-bolt-elements-textPrimary focus:outline-none"
                >
                  {PLAYBACK_SPEEDS.map((value) => (
                    <option key={value} value={value}>
                      {value}×
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => setViewMode((mode) => (mode === 'compare' ? 'version' : 'compare'))}
                aria-pressed={viewMode === 'compare'}
                data-testid="file-history-compare"
                className={classNames(
                  'flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-normal rounded-md border px-3 text-center text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] sm:flex-none',
                  viewMode === 'compare'
                    ? 'border-[var(--vc-ide-accent-action)] text-[var(--vc-ide-accent-action)]'
                    : 'border-bolt-elements-borderColor text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3',
                )}
              >
                <div className="i-ph:git-diff" aria-hidden />
                {copy['fileHistory.compareLatest']}
              </button>

              <button
                type="button"
                onClick={() => void handleRestore()}
                disabled={isLatestSelected || restoring}
                data-testid="file-history-restore"
                className="flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-normal rounded-md border border-bolt-elements-borderColor px-3 text-center text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 disabled:opacity-40 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] sm:ml-auto sm:flex-none"
              >
                <div
                  className={restoring ? 'i-svg-spinners:90-ring-with-bg' : 'i-ph:arrow-counter-clockwise'}
                  aria-hidden
                />
                {restoring ? copy['fileHistory.restoring'] : copy['fileHistory.restore']}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

FileHistoryPanel.displayName = 'FileHistoryPanel';

const InlineDiff = memo(({ diff, identicalCopy }: { diff: InlineDiffData; identicalCopy: string }) => {
  if (diff.added === 0 && diff.removed === 0) {
    return (
      <div
        className="flex h-full items-center justify-center px-6 text-center text-sm text-bolt-elements-textSecondary"
        data-testid="file-history-nodiff"
      >
        {identicalCopy}
      </div>
    );
  }

  return (
    <div className="font-mono text-xs leading-relaxed" data-testid="file-history-diff">
      {diff.lines.map((line, index) => (
        <div
          key={index}
          className="flex gap-2 px-4 py-0.5"
          style={
            line.type === 'added'
              ? { background: 'color-mix(in srgb, var(--status-success-text) 16%, transparent)' }
              : line.type === 'removed'
                ? { background: 'color-mix(in srgb, var(--status-error-text) 16%, transparent)' }
                : undefined
          }
        >
          <span
            aria-hidden
            className={classNames('w-3 shrink-0 select-none text-center', {
              'text-[var(--status-success-text)]': line.type === 'added',
              'text-[var(--status-error-text)]': line.type === 'removed',
              'text-bolt-elements-textTertiary': line.type === 'unchanged',
            })}
          >
            {line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ''}
          </span>
          <span className="whitespace-pre-wrap break-words text-bolt-elements-textPrimary">{line.text || ' '}</span>
        </div>
      ))}
    </div>
  );
});

InlineDiff.displayName = 'FileHistoryInlineDiff';
