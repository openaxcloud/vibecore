import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { FileHistorySourceViewer } from './FileHistorySourceViewer';
import { InlineFileHistoryDiff } from './InlineFileHistoryDiff';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { PanelLoading } from '~/components/ui/PanelBoundary';
import { Switch } from '~/components/ui/Switch';
import type { FileHistoryClient } from '~/lib/file-history/client';
import { fileHistoryPlaybackDelay } from '~/lib/file-history/diff';
import type { FileHistoryVersion } from '~/lib/file-history/types';
import {
  fileHistoryErrorMessage,
  useFileHistory,
  type FileHistoryRestoredValue,
} from '~/lib/file-history/useFileHistory';
import { themeStore } from '~/lib/stores/theme';
import { classNames } from '~/utils/classNames';

type PlaybackSpeed = 0.5 | 1 | 2;

export interface FileHistoryPanelProps {
  projectId: string;
  workspaceId: string;
  filePath: string;
  client?: FileHistoryClient;
  restoreDisabled?: boolean;
  restoreDisabledReason?: string;
  embeddedInModal?: boolean;
  showCloseButton?: boolean;
  onClose: () => void;
  onRestored?: (value: FileHistoryRestoredValue) => void | Promise<void>;
}

export function FileHistoryPanel({
  projectId,
  workspaceId,
  filePath,
  client,
  restoreDisabled,
  restoreDisabledReason,
  embeddedInModal = false,
  showCloseButton = true,
  onClose,
  onRestored,
}: FileHistoryPanelProps) {
  const theme = useStore(themeStore);
  const panelRef = useRef<HTMLElement>(null);
  const [compareLatest, setCompareLatest] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [preparingPlayback, setPreparingPlayback] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const history = useFileHistory({ projectId, workspaceId, filePath, client, onRestored });
  const basename = filePath.split('/').filter(Boolean).at(-1) ?? filePath;

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!playing) {
      return undefined;
    }

    if (history.selectedIndex < 0 || history.selectedIndex >= history.versions.length - 1) {
      setPlaying(false);

      return undefined;
    }

    if (
      history.selectedDetailEntry?.status === 'error' ||
      (history.selectedDetailEntry?.status === 'ready' &&
        history.selectedDetailEntry.detail?.version.encoding !== 'utf8')
    ) {
      setPlaying(false);

      return undefined;
    }

    if (history.selectedDetailEntry?.status !== 'ready') {
      /* Wait for the in-flight text detail without presenting a false pause. */

      return undefined;
    }

    const timer = window.setTimeout(
      () => {
        history.selectIndex(history.selectedIndex + 1);
      },
      fileHistoryPlaybackDelay(playbackSpeed) * (prefersReducedMotion ? 1.75 : 1),
    );

    return () => window.clearTimeout(timer);
  }, [
    history.selectIndex,
    history.selectedDetailEntry?.detail?.version.encoding,
    history.selectedDetailEntry?.status,
    history.selectedIndex,
    history.versions.length,
    playbackSpeed,
    playing,
    prefersReducedMotion,
  ]);

  useEffect(() => {
    if (history.isLatest && compareLatest) {
      setCompareLatest(false);
    }
  }, [compareLatest, history.isLatest]);

  useEffect(() => {
    if (compareLatest && history.latestVersionId) {
      history.ensureDetail(history.latestVersionId);
    }
  }, [compareLatest, history.ensureDetail, history.latestVersionId]);

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) {
        setPlaying(false);
      }
    };

    document.addEventListener('visibilitychange', pauseWhenHidden);

    return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
  }, []);

  const selectVersion = (index: number) => {
    setPlaying(false);
    history.selectIndex(index);
  };

  const togglePlayback = async () => {
    if (playing) {
      setPlaying(false);

      return;
    }

    setCompareLatest(false);

    if (!history.nextCursor) {
      history.selectIndex(0);
      setPlaying(true);

      return;
    }

    setPreparingPlayback(true);

    try {
      if (await history.preparePlayback()) {
        setPlaying(true);
      }
    } finally {
      setPreparingPlayback(false);
    }
  };

  const restartPlayback = async () => {
    setPlaying(false);
    setCompareLatest(false);

    if (!history.nextCursor) {
      history.selectIndex(0);
      return;
    }

    setPreparingPlayback(true);

    try {
      await history.preparePlayback();
    } finally {
      setPreparingPlayback(false);
    }
  };

  const handleKeyboardNavigation = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && !restoreDialogOpen) {
      event.preventDefault();
      onClose();

      return;
    }

    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') ||
      shouldPreserveArrowKey(event.target)
    ) {
      return;
    }

    event.preventDefault();
    selectVersion(history.selectedIndex + (event.key === 'ArrowRight' ? 1 : -1));
  };

  const selectedDetail = history.selectedDetailEntry?.detail;
  const latestDetail = history.latestDetailEntry?.detail;
  const selectedVersion = history.selectedVersion;

  const selectedDetailIsReadyText =
    history.selectedDetailEntry?.status === 'ready' && selectedDetail?.version.encoding === 'utf8';

  const versionLabel = selectedVersion
    ? `Version ${history.selectedIndex + 1} of ${history.versions.length}, ${formatVersionDate(selectedVersion)}`
    : 'No version selected';
  const restoreIsDisabled =
    Boolean(restoreDisabled) || history.isLatest || !selectedDetailIsReadyText || history.restoreStatus === 'loading';
  const restoreTitle = restoreDisabled
    ? (restoreDisabledReason ?? 'Unlock this file before restoring a version.')
    : history.isLatest
      ? 'This is already the latest version.'
      : history.selectedDetailEntry?.status === 'loading' || !history.selectedDetailEntry
        ? 'Wait for the selected revision to finish loading.'
        : history.selectedDetailEntry.status === 'error'
          ? 'Retry opening this revision before restoring it.'
          : !selectedDetailIsReadyText
            ? 'Binary revisions cannot be restored from this viewer.'
            : 'Restore this revision as a new version';

  return (
    <section
      ref={panelRef}
      className="vc-file-history-panel"
      role={embeddedInModal ? 'document' : 'dialog'}
      aria-modal={embeddedInModal ? undefined : 'true'}
      aria-labelledby="vc-file-history-title"
      tabIndex={-1}
      onKeyDown={handleKeyboardNavigation}
      data-testid="file-history-panel"
    >
      <header className="vc-file-history-header">
        <div className="vc-file-history-heading-mark" aria-hidden>
          <span className="i-ph:clock-counter-clockwise-duotone" />
        </div>
        <div className="vc-file-history-heading-copy">
          <h2 id="vc-file-history-title">File History</h2>
          <div className="vc-file-history-file" title={filePath}>
            <span className="i-ph:file-code-duotone" aria-hidden />
            <strong>{basename}</strong>
            <span>{selectedVersion ? describeVersion(selectedVersion) : 'Loading timeline…'}</span>
          </div>
        </div>
        {history.nextCursor ? (
          <button
            type="button"
            className="vc-file-history-subtle-action"
            disabled={history.loadingMore}
            onClick={() => void history.loadMore()}
            aria-label={
              history.loadingMore
                ? 'Loading older file versions'
                : history.loadMoreError
                  ? 'Retry loading older file versions'
                  : 'Load older file versions'
            }
          >
            <span
              className={history.loadingMore ? 'i-svg-spinners:90-ring-with-bg' : 'i-ph:clock-countdown'}
              aria-hidden
            />
            <span className="vc-file-history-subtle-action-label">
              {history.loadingMore ? 'Loading…' : history.loadMoreError ? 'Retry older versions' : 'Older versions'}
            </span>
          </button>
        ) : null}
        {showCloseButton ? (
          <button type="button" className="vc-file-history-close" onClick={onClose} aria-label="Close file history">
            <span className="i-ph:x" aria-hidden />
          </button>
        ) : (
          <span className="vc-file-history-close" style={{ visibility: 'hidden' }} aria-hidden />
        )}
      </header>

      <div className="vc-file-history-body">
        {history.listStatus === 'loading' ? <PanelLoading title="Loading file history" /> : null}
        {history.listStatus === 'error' ? (
          <HistoryErrorState
            title="File History could not be loaded"
            message={fileHistoryErrorMessage(history.listError)}
            onRetry={history.retryList}
          />
        ) : null}
        {history.listStatus === 'ready' && history.versions.length === 0 ? (
          <div className="vc-file-history-empty" role="status">
            <span className="i-ph:clock-counter-clockwise-duotone" aria-hidden />
            <h3>No earlier versions yet</h3>
            <p>Saved editor and agent changes will appear here as an append-only timeline.</p>
          </div>
        ) : null}
        {history.listStatus === 'ready' && history.versions.length > 0 ? (
          <>
            {history.selectedDetailEntry?.status === 'loading' || !history.selectedDetailEntry ? (
              <PanelLoading title="Loading selected version" />
            ) : null}
            {history.selectedDetailEntry?.status === 'error' && selectedVersion ? (
              <HistoryErrorState
                title="This version could not be opened"
                message={fileHistoryErrorMessage(history.selectedDetailEntry.error)}
                onRetry={() => history.retryDetail(selectedVersion.id)}
              />
            ) : null}
            {history.selectedDetailEntry?.status === 'ready' && selectedDetail?.version.encoding === 'base64' ? (
              <div className="vc-file-history-empty" role="status">
                <span className="i-ph:file-lock-duotone" aria-hidden />
                <h3>Binary revision</h3>
                <p>Playback and inline comparison are available for text revisions only.</p>
              </div>
            ) : null}
            {history.selectedDetailEntry?.status === 'ready' && selectedDetail?.version.encoding === 'utf8' ? (
              compareLatest && !history.isLatest ? (
                history.latestDetailEntry?.status === 'error' && history.latestVersionId ? (
                  <HistoryErrorState
                    title="Latest version could not be loaded"
                    message={fileHistoryErrorMessage(history.latestDetailEntry.error)}
                    onRetry={() => history.retryDetail(history.latestVersionId!)}
                  />
                ) : latestDetail?.version.encoding === 'utf8' ? (
                  <InlineFileHistoryDiff
                    selectedContent={selectedDetail.content}
                    latestContent={latestDetail.content}
                  />
                ) : (
                  <PanelLoading title="Preparing inline comparison" />
                )
              ) : (
                <FileHistorySourceViewer
                  projectId={projectId}
                  filePath={filePath}
                  content={selectedDetail.content}
                  theme={theme === 'dark' ? 'dark' : 'light'}
                />
              )
            ) : null}
          </>
        ) : null}
      </div>

      {history.listStatus === 'ready' && history.versions.length > 0 ? (
        <footer className="vc-file-history-footer">
          <div className="vc-file-history-announcer" aria-live="polite" aria-atomic="true">
            {history.loadMoreError
              ? `Older versions could not be loaded. ${fileHistoryErrorMessage(history.loadMoreError)}`
              : history.restoreStatus === 'success'
                ? 'Restored as a new version. No earlier history was removed.'
                : history.restoreStatus === 'error'
                  ? fileHistoryErrorMessage(history.restoreError)
                  : preparingPlayback
                    ? 'Loading the complete timeline before playback.'
                    : playing
                      ? `Playing file history at ${playbackSpeed} times speed.`
                      : versionLabel}
          </div>

          {!history.continuity.complete ? (
            <div className="vc-file-history-feedback is-warning" role="alert">
              <span className="i-ph:warning-diamond-fill" aria-hidden />
              <span>
                <strong>Timeline may be incomplete.</strong> The current workspace was reconciled, but intermediate
                edits during a watcher interruption may be missing.
                {history.continuity.reconciledAt ? (
                  <small> Last checked {formatContinuityDate(history.continuity.reconciledAt)}.</small>
                ) : null}
              </span>
            </div>
          ) : null}

          {history.loadMoreError ? (
            <div className="vc-file-history-feedback is-error" role="alert">
              <span className="i-ph:warning-circle-fill" aria-hidden />
              Older versions could not be loaded. {fileHistoryErrorMessage(history.loadMoreError)}
              <button type="button" disabled={history.loadingMore} onClick={() => void history.loadMore()}>
                {history.loadingMore ? 'Retrying…' : 'Retry older versions'}
              </button>
            </div>
          ) : null}

          {history.restoreStatus === 'success' ? (
            <div className="vc-file-history-feedback is-success" role="status">
              <span className="i-ph:check-circle-fill" aria-hidden />
              Restored as a new version. Every earlier version remains in the timeline.
              <button type="button" onClick={history.clearRestoreFeedback} aria-label="Dismiss restore confirmation">
                <span className="i-ph:x" aria-hidden />
              </button>
            </div>
          ) : null}
          {history.restoreStatus === 'error' ? (
            <div className="vc-file-history-feedback is-error" role="alert">
              <span className="i-ph:warning-circle-fill" aria-hidden />
              {fileHistoryErrorMessage(history.restoreError)}
              <button type="button" onClick={history.retryList}>
                Refresh timeline
              </button>
            </div>
          ) : null}

          <div className="vc-file-history-timeline">
            <button
              type="button"
              className="vc-file-history-icon-action"
              aria-label="Previous version"
              title="Previous version (Left Arrow)"
              disabled={history.selectedIndex <= 0}
              onClick={() => selectVersion(history.selectedIndex - 1)}
            >
              <span className="i-ph:caret-left-bold" aria-hidden />
            </button>
            <div className="vc-file-history-range-wrap">
              <input
                type="range"
                min={0}
                max={Math.max(0, history.versions.length - 1)}
                step={1}
                value={Math.max(0, history.selectedIndex)}
                onChange={(event) => selectVersion(Number(event.currentTarget.value))}
                aria-label="File history version"
                aria-valuetext={versionLabel}
                style={
                  {
                    '--vc-file-history-progress': `${
                      history.versions.length <= 1
                        ? 100
                        : (Math.max(0, history.selectedIndex) / (history.versions.length - 1)) * 100
                    }%`,
                  } as CSSProperties
                }
              />
              <div className="vc-file-history-range-meta">
                <span>
                  Version {history.selectedIndex + 1} of {history.versions.length}
                </span>
                <time dateTime={selectedVersion?.createdAt}>
                  {selectedVersion ? formatVersionDate(selectedVersion) : ''}
                </time>
              </div>
            </div>
            <button
              type="button"
              className="vc-file-history-icon-action"
              aria-label="Next version"
              title="Next version (Right Arrow)"
              disabled={history.selectedIndex >= history.versions.length - 1}
              onClick={() => selectVersion(history.selectedIndex + 1)}
            >
              <span className="i-ph:caret-right-bold" aria-hidden />
            </button>
          </div>

          <div className="vc-file-history-actions">
            <label
              className={classNames(
                'vc-file-history-compare',
                (history.isLatest || !selectedDetailIsReadyText) && 'is-disabled',
              )}
            >
              <Switch
                checked={compareLatest}
                disabled={history.isLatest || !selectedDetailIsReadyText}
                onCheckedChange={(checked) => {
                  setPlaying(false);
                  setCompareLatest(checked);
                }}
                aria-label="Compare selected version with latest"
              />
              <span>
                <strong>Compare Latest</strong>
                <small>Inline changes</small>
              </span>
            </label>

            <div className="vc-file-history-playback" aria-label="Playback controls">
              <button
                type="button"
                className="vc-file-history-icon-action"
                aria-label="Restart playback from first version"
                title="Restart playback"
                disabled={preparingPlayback}
                onClick={() => void restartPlayback()}
              >
                <span
                  className={preparingPlayback ? 'i-svg-spinners:90-ring-with-bg' : 'i-ph:skip-back-bold'}
                  aria-hidden
                />
              </button>
              <button
                type="button"
                className="vc-file-history-play-button"
                disabled={preparingPlayback}
                onClick={() => void togglePlayback()}
                aria-label={
                  preparingPlayback
                    ? 'Loading complete file history for playback'
                    : playing
                      ? 'Pause file history playback'
                      : 'Play file history'
                }
                aria-pressed={playing}
                title={prefersReducedMotion ? 'Playback uses reduced motion' : 'Replay file changes'}
              >
                <span
                  className={
                    preparingPlayback
                      ? 'i-svg-spinners:90-ring-with-bg'
                      : playing
                        ? 'i-ph:pause-fill'
                        : 'i-ph:play-fill'
                  }
                  aria-hidden
                />
                {preparingPlayback ? 'Loading…' : playing ? 'Pause' : 'Play'}
              </button>
              <div className="vc-file-history-speed" aria-label="Playback speed">
                {([0.5, 1, 2] as const).map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    className={playbackSpeed === speed ? 'is-active' : undefined}
                    aria-pressed={playbackSpeed === speed}
                    onClick={() => setPlaybackSpeed(speed)}
                  >
                    {speed}×
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="vc-file-history-restore"
              disabled={restoreIsDisabled}
              title={restoreTitle}
              onClick={() => setRestoreDialogOpen(true)}
            >
              <span
                className={
                  history.restoreStatus === 'loading' ? 'i-svg-spinners:90-ring-with-bg' : 'i-ph:arrow-u-up-left-bold'
                }
                aria-hidden
              />
              {history.restoreStatus === 'loading' ? 'Restoring…' : 'Restore'}
            </button>
          </div>
        </footer>
      ) : null}

      <ConfirmationDialog
        isOpen={restoreDialogOpen}
        onClose={() => {
          if (history.restoreStatus !== 'loading') {
            setRestoreDialogOpen(false);
          }
        }}
        title={`Restore ${basename}?`}
        description={
          <span>
            The selected content from{' '}
            <strong>{selectedVersion ? formatVersionDate(selectedVersion) : 'this version'}</strong> will become the
            latest file content. Restore appends a new version; it never deletes or rewrites existing history.
            {history.restoreStatus === 'error' ? (
              <span role="alert" style={{ display: 'block', marginTop: 12, color: 'var(--vc-ide-accent-warning)' }}>
                Restore failed: {fileHistoryErrorMessage(history.restoreError)} You can safely retry; the same operation
                will not append the version twice.
              </span>
            ) : null}
          </span>
        }
        confirmLabel={history.restoreStatus === 'error' ? 'Retry restore' : 'Restore as new version'}
        cancelLabel="Keep current file"
        variant="default"
        isLoading={history.restoreStatus === 'loading'}
        onConfirm={() => {
          void history.restoreSelected().then((restored) => {
            if (restored) {
              setRestoreDialogOpen(false);
            }
          });
        }}
      />
    </section>
  );
}

function HistoryErrorState({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div className="vc-file-history-error" role="alert">
      <span className="i-ph:warning-circle-duotone" aria-hidden />
      <h3>{title}</h3>
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        <span className="i-ph:arrow-clockwise-bold" aria-hidden />
        Try again
      </button>
    </div>
  );
}

function formatVersionDate(version: FileHistoryVersion): string {
  const value = new Date(version.createdAt);

  if (Number.isNaN(value.getTime())) {
    return 'Unknown time';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(value);
}

function describeVersion(version: FileHistoryVersion): string {
  const source = version.actor?.name ?? sourceLabel(version.source);

  const operation =
    version.operation === 'restore'
      ? 'restored'
      : version.operation === 'delete'
        ? 'deleted'
        : version.operation === 'rename'
          ? `renamed${version.renamedFromPath ? ` from ${version.renamedFromPath}` : ''}`
          : version.operation;

  return `${operation} by ${source}`;
}

function formatContinuityDate(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? 'recently'
    : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(date);
}

function sourceLabel(source: FileHistoryVersion['source']): string {
  switch (source) {
    case 'agent':
      return 'Agent';
    case 'editor':
      return 'Editor';
    case 'terminal':
      return 'Terminal';
    case 'import':
      return 'Import';
    case 'external':
      return 'External change';
    case 'system':
      return 'System';
  }

  return source;
}

function shouldPreserveArrowKey(target: EventTarget): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      'input, textarea, select, button, [contenteditable="true"], .monaco-editor, .cm-editor, [role="slider"]',
    ),
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);

    update();
    query.addEventListener('change', update);

    return () => query.removeEventListener('change', update);
  }, []);

  return reduced;
}
