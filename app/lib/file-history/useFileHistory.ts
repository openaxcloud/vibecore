import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createFileHistoryClient,
  createFileHistoryOperationId,
  FileHistoryApiError,
  type FileHistoryClient,
} from './client';
import { orderFileHistoryVersionsChronologically } from './diff';
import type { FileHistoryContinuity, FileHistoryDetailResponse, FileHistoryTarget, FileHistoryVersion } from './types';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';
type RestoreStatus = 'idle' | 'loading' | 'success' | 'error';

interface DetailEntry {
  status: LoadStatus;
  detail?: FileHistoryDetailResponse;
  error?: Error;
}

export interface FileHistoryRestoredValue {
  content: string;
  version: FileHistoryVersion;
}

export interface UseFileHistoryOptions extends FileHistoryTarget {
  client?: FileHistoryClient;
  pageSize?: number;
  onRestored?: (value: FileHistoryRestoredValue) => void | Promise<void>;
}

const defaultClient = createFileHistoryClient();
const completeContinuity = (): FileHistoryContinuity => ({ complete: true, reasons: [], droppedEvents: 0 });

export function useFileHistory({
  projectId,
  workspaceId,
  filePath,
  client = defaultClient,
  pageSize = 100,
  onRestored,
}: UseFileHistoryOptions) {
  const targetKey = `${projectId}:${workspaceId}:${filePath}`;

  const target = useMemo<FileHistoryTarget>(
    () => ({ projectId, workspaceId, filePath }),
    [filePath, projectId, workspaceId],
  );

  const [versions, setVersions] = useState<FileHistoryVersion[]>([]);
  const [latestVersionId, setLatestVersionId] = useState<string>();
  const [nextCursor, setNextCursor] = useState<string>();
  const [total, setTotal] = useState(0);
  const [continuity, setContinuity] = useState<FileHistoryContinuity>(completeContinuity);
  const [listStatus, setListStatus] = useState<LoadStatus>('loading');
  const [listError, setListError] = useState<Error>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<Error>();
  const [selectedVersionId, setSelectedVersionId] = useState<string>();
  const [details, setDetails] = useState<Record<string, DetailEntry>>({});
  const detailsRef = useRef(details);
  const versionsRef = useRef<FileHistoryVersion[]>([]);
  const nextCursorRef = useRef<string>();
  const detailControllersRef = useRef(new Map<string, AbortController>());
  const listControllerRef = useRef<AbortController>();
  const loadMoreControllerRef = useRef<AbortController>();
  const restoreControllerRef = useRef<AbortController>();
  const [reloadGeneration, setReloadGeneration] = useState(0);
  const [detailRetryGeneration, setDetailRetryGeneration] = useState(0);
  const [restoreStatus, setRestoreStatus] = useState<RestoreStatus>('idle');
  const [restoreError, setRestoreError] = useState<Error>();
  const restoreOperationRef = useRef<{ key: string; id: string }>();
  const onRestoredRef = useRef(onRestored);
  const mountedRef = useRef(false);

  onRestoredRef.current = onRestored;

  const updateDetails = useCallback(
    (updater: (current: Record<string, DetailEntry>) => Record<string, DetailEntry>) => {
      /*
       * Commit the ref synchronously before React schedules the render. Effects
       * such as matchMedia can re-render the panel in the same tick; if the ref
       * still said "idle", that render would abort and restart the in-flight
       * detail request forever while the UI remained on its loading skeleton.
       */
      const next = updater(detailsRef.current);
      detailsRef.current = next;
      setDetails(next);
    },
    [],
  );

  useEffect(() => {
    listControllerRef.current?.abort();
    loadMoreControllerRef.current?.abort();
    restoreControllerRef.current?.abort();

    for (const controller of detailControllersRef.current.values()) {
      controller.abort();
    }

    detailControllersRef.current.clear();
    detailsRef.current = {};
    versionsRef.current = [];
    nextCursorRef.current = undefined;
    setDetails({});
    setVersions([]);
    setLatestVersionId(undefined);
    setNextCursor(undefined);
    setTotal(0);
    setContinuity(completeContinuity());
    setSelectedVersionId(undefined);
    setListStatus('loading');
    setListError(undefined);
    setLoadingMore(false);
    setLoadMoreError(undefined);
    setRestoreStatus('idle');
    setRestoreError(undefined);
    restoreOperationRef.current = undefined;

    const controller = new AbortController();
    listControllerRef.current = controller;

    void client
      .listVersions({ ...target, limit: pageSize }, controller.signal)
      .then((payload) => {
        if (controller.signal.aborted) {
          return;
        }

        const ordered = orderFileHistoryVersionsChronologically(payload.versions);
        const newestReturnedId = ordered.at(-1)?.id;

        const latestId = payload.latestVersionId === newestReturnedId ? payload.latestVersionId : newestReturnedId;

        versionsRef.current = ordered;
        nextCursorRef.current = payload.nextCursor;
        setVersions(ordered);
        setLatestVersionId(latestId);
        setNextCursor(payload.nextCursor);
        setTotal(payload.total);
        setContinuity(payload.continuity);
        setSelectedVersionId(latestId);
        setListStatus('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortedError(error)) {
          return;
        }

        setListError(toError(error));
        setListStatus('error');
      });

    return () => {
      controller.abort();
    };
  }, [client, pageSize, reloadGeneration, target, targetKey]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      listControllerRef.current?.abort();
      loadMoreControllerRef.current?.abort();
      restoreControllerRef.current?.abort();

      for (const controller of detailControllersRef.current.values()) {
        controller.abort();
      }
    };
  }, []);

  const ensureDetail = useCallback(
    (versionId: string, force = false) => {
      const existing = detailsRef.current[versionId];
      const activeController = detailControllersRef.current.get(versionId);

      if (
        !force &&
        (existing?.status === 'ready' ||
          (existing?.status === 'loading' && activeController && !activeController.signal.aborted))
      ) {
        return;
      }

      detailControllersRef.current.get(versionId)?.abort();

      const controller = new AbortController();
      detailControllersRef.current.set(versionId, controller);
      updateDetails((current) => ({
        ...current,
        [versionId]: { status: 'loading' },
      }));

      void client
        .getVersion(target, versionId, controller.signal)
        .then((detail) => {
          if (controller.signal.aborted) {
            return;
          }

          updateDetails((current) => ({
            ...current,
            [versionId]: { status: 'ready', detail },
          }));
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || isAbortedError(error)) {
            return;
          }

          updateDetails((current) => ({
            ...current,
            [versionId]: { status: 'error', error: toError(error) },
          }));
        })
        .finally(() => {
          if (detailControllersRef.current.get(versionId) === controller) {
            detailControllersRef.current.delete(versionId);

            /*
             * React Strict Mode intentionally tears effects down once during
             * development. An aborted client may resolve before it observes
             * the signal, so recovery belongs in `finally` rather than only in
             * the rejection path. Real target changes clear the controller map
             * first, and real unmounts keep `mountedRef` false.
             */
            if (controller.signal.aborted && mountedRef.current) {
              updateDetails((current) => ({
                ...current,
                [versionId]: { status: 'idle' },
              }));
              setDetailRetryGeneration((current) => current + 1);
            }
          }
        });
    },
    [client, target, updateDetails],
  );

  useEffect(() => {
    if (selectedVersionId) {
      ensureDetail(selectedVersionId);
    }
  }, [detailRetryGeneration, ensureDetail, selectedVersionId]);

  const selectedIndex = useMemo(
    () => versions.findIndex((version) => version.id === selectedVersionId),
    [selectedVersionId, versions],
  );

  const selectedVersion = selectedIndex >= 0 ? versions[selectedIndex] : undefined;
  const selectedDetailEntry = selectedVersionId ? details[selectedVersionId] : undefined;
  const latestDetailEntry = latestVersionId ? details[latestVersionId] : undefined;

  const setSelectedIndex = useCallback(
    (index: number) => {
      const bounded = Math.max(0, Math.min(index, versions.length - 1));
      const version = versions[bounded];

      if (version) {
        setSelectedVersionId(version.id);
        setRestoreStatus('idle');
        setRestoreError(undefined);
      }
    },
    [versions],
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) {
      return;
    }

    loadMoreControllerRef.current?.abort();

    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    setLoadingMore(true);
    setLoadMoreError(undefined);

    try {
      const payload = await client.listVersions({ ...target, cursor: nextCursor, limit: pageSize }, controller.signal);

      if (controller.signal.aborted) {
        return;
      }

      const ordered = orderFileHistoryVersionsChronologically([...versionsRef.current, ...payload.versions]);
      versionsRef.current = ordered;
      nextCursorRef.current = payload.nextCursor;
      setVersions(ordered);
      setNextCursor(payload.nextCursor);
      setTotal(payload.total);
      setContinuity(payload.continuity);
    } catch (error) {
      if (!controller.signal.aborted && !isAbortedError(error)) {
        /*
         * A pagination failure must not replace a successfully loaded timeline.
         * Keep the current revisions navigable and expose a retryable, scoped
         * error instead of reusing the fatal first-page error channel.
         */
        setLoadMoreError(toError(error));
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoadingMore(false);
      }
    }
  }, [client, loadingMore, nextCursor, pageSize, target]);

  const preparePlayback = useCallback(async () => {
    loadMoreControllerRef.current?.abort();
    setLoadMoreError(undefined);

    let cursor = nextCursorRef.current;

    if (!cursor) {
      loadMoreControllerRef.current = undefined;
      setLoadingMore(false);

      const first = versionsRef.current.at(0);

      if (first) {
        setSelectedVersionId(first.id);
      }

      return Boolean(first);
    }

    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    setLoadingMore(true);

    try {
      const seenCursors = new Set<string>();

      while (cursor) {
        if (seenCursors.has(cursor)) {
          throw new Error('File History returned a repeated pagination cursor.');
        }

        seenCursors.add(cursor);

        const payload = await client.listVersions({ ...target, cursor, limit: pageSize }, controller.signal);

        if (controller.signal.aborted) {
          return false;
        }

        const ordered = orderFileHistoryVersionsChronologically([...versionsRef.current, ...payload.versions]);
        versionsRef.current = ordered;
        nextCursorRef.current = payload.nextCursor;
        cursor = payload.nextCursor;
        setVersions(ordered);
        setNextCursor(payload.nextCursor);
        setTotal(payload.total);
        setContinuity(payload.continuity);
      }

      const first = versionsRef.current.at(0);

      if (first) {
        setSelectedVersionId(first.id);
        setRestoreStatus('idle');
        setRestoreError(undefined);
      }

      return Boolean(first);
    } catch (error) {
      if (!controller.signal.aborted && !isAbortedError(error)) {
        setLoadMoreError(toError(error));
      }

      return false;
    } finally {
      if (loadMoreControllerRef.current === controller) {
        loadMoreControllerRef.current = undefined;
        setLoadingMore(false);
      }
    }
  }, [client, pageSize, target]);

  const restoreSelected = useCallback(async () => {
    if (
      !selectedVersionId ||
      !selectedDetailEntry?.detail ||
      selectedDetailEntry.detail.version.encoding !== 'utf8' ||
      !latestVersionId
    ) {
      return false;
    }

    const operationKey = `${selectedVersionId}:${latestVersionId}`;

    if (restoreOperationRef.current?.key !== operationKey) {
      restoreOperationRef.current = { key: operationKey, id: createFileHistoryOperationId() };
    }

    restoreControllerRef.current?.abort();

    const controller = new AbortController();
    restoreControllerRef.current = controller;
    setRestoreStatus('loading');
    setRestoreError(undefined);

    try {
      const response = await client.restoreVersion(
        target,
        selectedVersionId,
        {
          workspaceId,
          expectedLatestVersionId: latestVersionId,
          operationId: restoreOperationRef.current.id,
        },
        controller.signal,
      );

      if (controller.signal.aborted) {
        return false;
      }

      const restoredDetail: FileHistoryDetailResponse = {
        version: response.version,
        content: selectedDetailEntry.detail.content,
      };

      /*
       * Adopt the persisted content before advancing the local timeline. If
       * the editor cannot adopt it, keep the selected/base revision stable so
       * the same idempotency key can safely retry without appending twice.
       */
      await onRestoredRef.current?.({ content: restoredDetail.content, version: response.version });

      if (controller.signal.aborted) {
        return false;
      }

      const revisionAlreadyKnown = versions.some((version) => version.id === response.version.id);

      const ordered = orderFileHistoryVersionsChronologically([...versionsRef.current, response.version]);
      versionsRef.current = ordered;
      setVersions(ordered);
      setLatestVersionId(response.version.id);
      setSelectedVersionId(response.version.id);
      setTotal((current) => (revisionAlreadyKnown ? current : current + 1));
      updateDetails((current) => ({
        ...current,
        [response.version.id]: { status: 'ready', detail: restoredDetail },
      }));

      restoreOperationRef.current = undefined;
      setRestoreStatus('success');

      return true;
    } catch (error) {
      if (controller.signal.aborted || isAbortedError(error)) {
        return false;
      }

      setRestoreError(toError(error));
      setRestoreStatus('error');

      return false;
    }
  }, [client, latestVersionId, selectedDetailEntry, selectedVersionId, target, updateDetails, versions, workspaceId]);

  const retryList = useCallback(() => {
    setReloadGeneration((current) => current + 1);
  }, []);

  const clearRestoreFeedback = useCallback(() => {
    setRestoreStatus('idle');
    setRestoreError(undefined);
  }, []);

  return {
    versions,
    latestVersionId,
    total,
    continuity,
    nextCursor,
    listStatus,
    listError,
    loadingMore,
    loadMoreError,
    selectedIndex,
    selectedVersion,
    selectedDetailEntry,
    latestDetailEntry,
    restoreStatus,
    restoreError,
    isLatest: selectedVersionId === latestVersionId,
    selectIndex: setSelectedIndex,
    ensureDetail,
    retryDetail: (versionId: string) => ensureDetail(versionId, true),
    loadMore,
    preparePlayback,
    restoreSelected,
    retryList,
    clearRestoreFeedback,
  };
}

export function fileHistoryErrorMessage(error: Error | undefined): string {
  if (!error) {
    return 'File History is unavailable right now.';
  }

  if (error instanceof FileHistoryApiError) {
    switch (error.code) {
      case 'FILE_HISTORY_CONFLICT':
        return 'This file changed after you opened History. Refresh the timeline before restoring.';
      case 'PROJECT_ROLE_READ_ONLY':
      case 'RBAC_FORBIDDEN':
        return 'Your project role does not allow restoring this file.';
      case 'FILE_HISTORY_TOO_LARGE':
        return 'This revision is too large to display in File History.';
      case 'FILE_HISTORY_UNSUPPORTED':
        return 'File History does not support this revision type.';
      case 'FILE_HISTORY_TIMEOUT':
        return 'File History took too long to respond. Try again.';
      default:
        return error.message;
    }
  }

  return error.message || 'File History is unavailable right now.';
}

function isAbortedError(error: unknown): boolean {
  return error instanceof FileHistoryApiError && error.code === 'FILE_HISTORY_ABORTED';
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error('File History is unavailable right now.');
}
