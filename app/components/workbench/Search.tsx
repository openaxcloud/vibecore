import { useStore } from '@nanostores/react';
import type { FileSearchOptions } from '@vibecore/runtime-contract';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import {
  computeReplacement,
  hasUnsavedEdits,
  isLatestSearch,
  needsContentHydration,
  toRuntimeRelativePath,
} from './search-replace';
import { IdePanelHeader, PanelButton, PanelEmptyState, PanelInput } from '~/components/project-ide/PanelPrimitives';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { useRuntimeAdapter } from '~/lib/runtime/RuntimeAdapterProvider';
import { workbenchStore } from '~/lib/stores/workbench';
import { WORK_DIR } from '~/utils/constants';
import { debounce } from '~/utils/debounce';

interface DisplayMatch {
  path: string;
  lineNumber: number;
  previewText: string;
  matchCharStart: number;
  matchCharEnd: number;
}

function groupResultsByFile(results: DisplayMatch[]): Record<string, DisplayMatch[]> {
  return results.reduce(
    (acc, result) => {
      if (!acc[result.path]) {
        acc[result.path] = [];
      }

      acc[result.path].push(result);

      return acc;
    },
    {} as Record<string, DisplayMatch[]>,
  );
}

export function Search() {
  const { t } = useTranslation();

  /*
   * Use the workspace-bound adapter from context, NOT the module singleton (which
   * has no workspaceId and fails in remote-kubernetes mode → broken file search).
   */
  const runtimeAdapter = useRuntimeAdapter();
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [isRegex, setIsRegex] = useState(false);
  const [searchResults, setSearchResults] = useState<DisplayMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [confirmReplaceAllOpen, setConfirmReplaceAllOpen] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState(false);

  /*
   * Files the last Replace All skipped because they had unsaved editor edits.
   * The note derives its visibility from the LIVE unsaved set, so it disappears
   * by itself once the user saves (or Save all & retry runs).
   */
  const [skippedUnsavedPaths, setSkippedUnsavedPaths] = useState<string[]>([]);
  const unsavedFilesNow = useStore(workbenchStore.unsavedFiles);

  const pendingUnsavedPaths = useMemo(
    () => skippedUnsavedPaths.filter((path) => unsavedFilesNow.has(path)),
    [skippedUnsavedPaths, unsavedFilesNow],
  );

  /*
   * Track the trailing min-loader timer and a monotonic token for the latest search.
   * handleSearch is debounced AND re-run by replaceAll, so a new search can start before
   * a previous fast search's trailing setTimeout fires. Without these guards that stale
   * timeout would clear the spinner of the newer in-flight search (premature flicker) and
   * could call setState after unmount (React warning). We clear the pending timer at the
   * start of every search and on unmount, and stamp each search with a token so only the
   * latest invocation is allowed to flip the spinner off.
   */
  const minLoaderTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchTokenRef = useRef(0);

  useEffect(() => {
    return () => {
      if (minLoaderTimerRef.current !== undefined) {
        clearTimeout(minLoaderTimerRef.current);
        minLoaderTimerRef.current = undefined;
      }
    };
  }, []);

  const groupedResults = useMemo(() => groupResultsByFile(searchResults), [searchResults]);

  useEffect(() => {
    if (searchResults.length > 0) {
      const allExpanded: Record<string, boolean> = {};
      Object.keys(groupedResults).forEach((file) => {
        allExpanded[file] = true;
      });
      setExpandedFiles(allExpanded);
    }
  }, [groupedResults, searchResults]);

  const handleSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchResults([]);
        setIsSearching(false);
        setExpandedFiles({});
        setHasSearched(false);
        setSearchError(false);

        return;
      }

      /*
       * Cancel any pending trailing min-loader timer from a prior fast search so it
       * can't clear the spinner of this newer search once it fires.
       */
      if (minLoaderTimerRef.current !== undefined) {
        clearTimeout(minLoaderTimerRef.current);
        minLoaderTimerRef.current = undefined;
      }

      const token = ++searchTokenRef.current;

      setIsSearching(true);
      setSearchResults([]);
      setExpandedFiles({});
      setHasSearched(true);
      setSearchError(false);

      const minLoaderTime = 300; // ms
      const start = Date.now();

      try {
        const options: FileSearchOptions = {
          // Index every file (including extensionless ones like Dockerfile/Makefile);
          // the excludes below prune the noise. `**/*.*` would skip extensionless files.
          includes: ['**/*'],
          excludes: ['**/node_modules/**', '**/package-lock.json', '**/.git/**', '**/dist/**', '**/*.lock'],
          resultLimit: 500,
          isRegex,
          caseSensitive,
        };

        const results = await runtimeAdapter.searchFiles(query, options);
        setSearchResults(
          results.map((match) => ({
            path: match.path,
            lineNumber: match.lineNumber,
            previewText: match.line,
            matchCharStart: match.startColumn,
            matchCharEnd: match.endColumn,
          })),
        );
      } catch (error) {
        console.error(error);
        setSearchError(true);
      } finally {
        const elapsed = Date.now() - start;

        /*
         * Only the latest search may flip the spinner off; a superseded search must
         * leave the newer one's spinner alone.
         */
        const stopSpinner = () => {
          if (isLatestSearch(token, searchTokenRef.current)) {
            setIsSearching(false);
          }
        };

        if (elapsed < minLoaderTime && isLatestSearch(token, searchTokenRef.current)) {
          minLoaderTimerRef.current = setTimeout(() => {
            minLoaderTimerRef.current = undefined;
            stopSpinner();
          }, minLoaderTime - elapsed);
        } else {
          stopSpinner();
        }
      }
    },
    [caseSensitive, isRegex, runtimeAdapter],
  );

  const debouncedSearch = useCallback(debounce(handleSearch, 300), [handleSearch]);

  useEffect(() => {
    debouncedSearch(searchQuery);
  }, [searchQuery, debouncedSearch, caseSensitive, isRegex]);

  const handleResultClick = (filePath: string, line?: number) => {
    workbenchStore.setSelectedFile(resolveWorkbenchPath(filePath) ?? filePath);

    /*
     * Adjust line number to be 0-based if it's defined
     * The search results use 1-based line numbers, but CodeMirrorEditor expects 0-based
     */
    const adjustedLine = typeof line === 'number' ? Math.max(0, line - 1) : undefined;

    workbenchStore.setCurrentDocumentScrollPosition({ line: adjustedLine, column: 0 });
  };

  const resolveWorkbenchPath = useCallback((filePath: string) => {
    const files = workbenchStore.files.get();

    if (files[filePath]?.type === 'file') {
      return filePath;
    }

    const absolutePath = filePath.startsWith(WORK_DIR) ? filePath : `${WORK_DIR}/${filePath.replace(/^\/+/, '')}`;

    if (files[absolutePath]?.type === 'file') {
      return absolutePath;
    }

    return Object.keys(files).find((candidate) => candidate.endsWith(`/${filePath.replace(/^\/+/, '')}`));
  }, []);

  const buildReplaceMatcher = useCallback((): RegExp | null => {
    try {
      /*
       * Multiline ('m') for regex mode so ^/$ anchors match per-line — matching the
       * server search that produced these results; without it Replace all diverges
       * from what was found.
       */
      const flags = (caseSensitive ? 'g' : 'gi') + (isRegex ? 'm' : '');

      return new RegExp(isRegex ? searchQuery : searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    } catch {
      return null;
    }
  }, [caseSensitive, isRegex, searchQuery]);

  /* G5: validate, then confirm via a token-styled dialog instead of window.confirm. */
  const replaceAll = useCallback(async () => {
    if (!searchQuery.trim() || searchResults.length === 0) {
      return;
    }

    if (!buildReplaceMatcher()) {
      toast.error(t('workbenchSearch.errors.invalidRegex'));
      return;
    }

    setConfirmReplaceAllOpen(true);
  }, [buildReplaceMatcher, searchQuery, searchResults, t]);

  const performReplaceAll = useCallback(async () => {
    const matcher = buildReplaceMatcher();

    if (!matcher) {
      toast.error(t('workbenchSearch.errors.invalidRegex'));
      return;
    }

    setIsReplacing(true);

    try {
      const files = workbenchStore.files.get();
      const unsavedFiles = workbenchStore.unsavedFiles.get();

      const targetPaths = [
        ...new Set(searchResults.map((result) => resolveWorkbenchPath(result.path)).filter(Boolean)),
      ] as string[];

      let replacementCount = 0;
      let lockedSkipped = 0;
      let unreadableSkipped = 0;
      let unsavedSkipped = 0;

      const skippedUnsaved: string[] = [];

      for (const filePath of targetPaths) {
        const entry = files[filePath];

        if (entry?.type !== 'file' || entry.isBinary) {
          continue;
        }

        /*
         * Never clobber unsaved editor edits. Replace All computes against the
         * files-store (on-disk) copy and writes back through writeFileContent,
         * which clears the dirty flag and resets the open editor document. If
         * the user has the file open with unsaved changes, that on-disk copy is
         * stale and the write would silently destroy their in-progress work, so
         * we skip+warn (same treatment as locked files) and let them save first.
         */
        if (hasUnsavedEdits(unsavedFiles, filePath)) {
          unsavedSkipped += 1;
          skippedUnsaved.push(filePath);
          continue;
        }

        /*
         * Respect file/folder locks. Replace All is a content-modifying op in the
         * same workbench surface as the editor (read-only for locked files) and AI
         * writes (blocked for locked files); without this guard a bulk replace
         * silently overwrote a file the user explicitly locked to protect it.
         */
        if (workbenchStore.isFileLocked(filePath).locked) {
          lockedSkipped += 1;
          continue;
        }

        /*
         * In remote-kubernetes mode the file tree is loaded with content stripped
         * (mapRuntimeNodes), so any file the user has not individually opened sits
         * in the store with content === ''. Replacing against '' produces no change
         * and silently writes nothing while still reporting success. Hydrate the
         * real on-disk content from the runtime before computing the replacement,
         * so Replace All actually edits unopened files instead of being decorative.
         */
        let content = entry.content;

        if (needsContentHydration(content)) {
          try {
            content = (await runtimeAdapter.readFile(toRuntimeRelativePath(filePath, runtimeAdapter.workdir))).content;
          } catch (readError) {
            console.error(filePath, readError);
            unreadableSkipped += 1;
            continue;
          }
        }

        const { nextContent, count } = computeReplacement(content, matcher, replaceQuery);

        if (count > 0 && nextContent !== content) {
          replacementCount += count;
          await workbenchStore.writeFileContent(filePath, nextContent);
        }
      }

      setSkippedUnsavedPaths(skippedUnsaved);

      const skippedNotes = [
        lockedSkipped > 0 ? t('workbenchSearch.skipped.locked', { count: lockedSkipped }) : undefined,
        unsavedSkipped > 0 ? t('workbenchSearch.skipped.unsaved', { count: unsavedSkipped }) : undefined,
        unreadableSkipped > 0 ? t('workbenchSearch.skipped.unreadable', { count: unreadableSkipped }) : undefined,
      ].filter(Boolean);

      toast.success(
        t('workbenchSearch.replaced', { count: replacementCount }) +
          (skippedNotes.length > 0 ? ` (${skippedNotes.join(', ')})` : ''),
      );
      await handleSearch(searchQuery);
    } catch (error) {
      console.error(error);
      toast.error(t('workbenchSearch.errors.replace'));
    } finally {
      setIsReplacing(false);
    }
  }, [
    buildReplaceMatcher,
    handleSearch,
    replaceQuery,
    resolveWorkbenchPath,
    runtimeAdapter,
    searchQuery,
    searchResults,
    t,
  ]);

  const saveAllAndRetry = useCallback(async () => {
    await workbenchStore.saveAllFiles();
    setSkippedUnsavedPaths([]);
    await replaceAll();
  }, [replaceAll]);

  return (
    <div className="flex flex-col h-full bg-bolt-elements-background-depth-2">
      {/* UNIF-06 (audit H1) : Search n'avait AUCUNE tête de panneau — il adopte
          l'en-tête commun (même icône que l'onglet/rail, mêmes paddings). */}
      <IdePanelHeader icon="i-ph:magnifying-glass" title={t('workbenchSearch.panel.title')} />
      <ConfirmationDialog
        isOpen={confirmReplaceAllOpen}
        onClose={() => setConfirmReplaceAllOpen(false)}
        onConfirm={() => {
          setConfirmReplaceAllOpen(false);
          void performReplaceAll();
        }}
        title={t('workbenchSearch.dialog.title')}
        description={t('workbenchSearch.dialog.description', {
          matches: t('workbenchSearch.count.matches', { count: searchResults.length }),
          files: t('workbenchSearch.count.files', { count: Object.keys(groupedResults).length }),
        })}
        confirmLabel={t('workbenchSearch.dialog.confirm')}
        variant="destructive"
      />
      {/* Search Bar */}
      <div className="space-y-2 border-b border-bolt-elements-borderColor px-3 py-3">
        <div className="relative flex items-center gap-2">
          {/* UNIF lot 5 : input partagé PanelInput au lieu du champ ad hoc (fond depth-3, ring). */}
          <PanelInput
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('workbenchSearch.search.placeholder')}
            aria-label={t('workbenchSearch.search.aria')}
            className="w-full"
          />
          <button
            type="button"
            aria-label={t('workbenchSearch.search.toggleCase')}
            aria-pressed={caseSensitive}
            title={t('workbenchSearch.search.matchCase')}
            onClick={() => setCaseSensitive((value) => !value)}
            className={`h-7 rounded px-2 text-xs ${caseSensitive ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent' : 'text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3'}`}
          >
            {t('workbenchSearch.search.caseIndicator')}
          </button>
          <button
            type="button"
            aria-label={t('workbenchSearch.search.toggleRegex')}
            aria-pressed={isRegex}
            title={t('workbenchSearch.search.useRegex')}
            onClick={() => setIsRegex((value) => !value)}
            className={`h-7 rounded px-2 text-xs ${isRegex ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent' : 'text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3'}`}
          >
            .*
          </button>
        </div>
        <div className="relative flex items-center gap-2">
          <PanelInput
            type="text"
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            placeholder={t('workbenchSearch.replace.placeholder')}
            aria-label={t('workbenchSearch.replace.aria')}
            className="w-full"
          />
          {/* UNIF lot 5 : « Replace all » = PanelButton primaire partagé ; `!h-auto`
              + whitespace-normal pour laisser le libellé FR long passer sur 2 lignes
              (même recette que les CTA de SelectionDialog). */}
          <PanelButton
            type="button"
            className="!h-auto min-h-9 shrink-0 whitespace-normal py-1 text-center disabled:cursor-not-allowed"
            disabled={isReplacing || searchResults.length === 0}
            onClick={() => void replaceAll()}
          >
            {isReplacing ? t('workbenchSearch.replace.replacing') : t('workbenchSearch.replace.all')}
          </PanelButton>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto py-2">
        {pendingUnsavedPaths.length > 0 && (
          <div
            role="note"
            className="mx-3 mb-2 rounded-md px-3 py-2 text-xs"
            style={{
              background: 'color-mix(in srgb, var(--vc-ide-accent-warning) 12%, transparent)',
              borderLeft: '3px solid var(--vc-ide-accent-warning)',
              color: 'var(--status-warning-text)',
            }}
          >
            <p className="font-medium">{t('workbenchSearch.pending', { count: pendingUnsavedPaths.length })}</p>
            <ul className="mt-1 list-disc pl-4">
              {pendingUnsavedPaths.slice(0, 5).map((path) => (
                <li key={path} className="truncate">
                  {path.startsWith(`${WORK_DIR}/`) ? path.slice(WORK_DIR.length + 1) : path}
                </li>
              ))}
            </ul>
            {pendingUnsavedPaths.length > 5 ? (
              <p className="mt-1">{t('workbenchSearch.pending.more', { count: pendingUnsavedPaths.length - 5 })}</p>
            ) : null}
            <button
              type="button"
              onClick={saveAllAndRetry}
              disabled={isReplacing}
              className="mt-2 inline-flex min-h-9 items-center whitespace-normal rounded-md bg-[var(--vc-ide-accent-action)] px-2.5 py-1 text-left text-xs font-medium text-[var(--vc-ide-text-on-accent)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('workbenchSearch.pending.saveRetry')}
            </button>
          </div>
        )}
        {isSearching && (
          <div className="flex items-center justify-center h-32 text-bolt-elements-textTertiary">
            <div className="i-ph:circle-notch animate-spin mr-2" /> {t('workbenchSearch.searching')}
          </div>
        )}
        {!isSearching && searchError && (
          <div className="flex items-center justify-center h-32 px-4 text-center text-sm text-bolt-elements-icon-error">
            {t('workbenchSearch.errors.search')}
          </div>
        )}
        {/* UNIF lot 4 (audit E1) — état vide canonique au lieu du texte gris nu. */}
        {!isSearching && !searchError && hasSearched && searchResults.length === 0 && searchQuery.trim() !== '' && (
          <PanelEmptyState icon="i-ph:magnifying-glass" title={t('workbenchSearch.noResults')} className="mx-3" />
        )}
        {!isSearching &&
          Object.keys(groupedResults).map((file) => (
            <div key={file} className="mb-2">
              <button
                className="flex gap-2 items-center w-full text-left py-1 px-2 text-bolt-elements-textSecondary bg-transparent hover:bg-bolt-elements-background-depth-3 group"
                onClick={() => setExpandedFiles((prev) => ({ ...prev, [file]: !prev[file] }))}
              >
                <span
                  className=" i-ph:caret-down-thin w-3 h-3 text-bolt-elements-textSecondary transition-transform"
                  style={{ transform: expandedFiles[file] ? 'rotate(180deg)' : undefined }}
                />
                <span className="font-normal text-sm">{file.split('/').pop()}</span>
                <span className="h-5.5 w-5.5 flex items-center justify-center text-xs ml-auto bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent rounded-full">
                  {groupedResults[file].length}
                </span>
              </button>
              {expandedFiles[file] && (
                <div className="">
                  {groupedResults[file].map((match, idx) => {
                    const contextChars = 7;
                    const isStart = match.matchCharStart <= contextChars;
                    const previewStart = isStart ? 0 : match.matchCharStart - contextChars;
                    const previewText = match.previewText.slice(previewStart);
                    const matchStart = isStart ? match.matchCharStart : contextChars;

                    const matchEnd = isStart
                      ? match.matchCharEnd
                      : contextChars + (match.matchCharEnd - match.matchCharStart);

                    return (
                      <div
                        key={idx}
                        role="button"
                        tabIndex={0}
                        aria-label={t('workbenchSearch.resultAria', {
                          path: match.path,
                          line: match.lineNumber,
                        })}
                        className="hover:bg-bolt-elements-background-depth-3 cursor-pointer transition-colors pl-6 py-1"
                        onClick={() => handleResultClick(match.path, match.lineNumber)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleResultClick(match.path, match.lineNumber);
                          }
                        }}
                      >
                        <pre className="font-mono text-xs text-bolt-elements-textTertiary truncate">
                          {!isStart && <span>...</span>}
                          {previewText.slice(0, matchStart)}
                          <span className="bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent rounded px-1">
                            {previewText.slice(matchStart, matchEnd)}
                          </span>
                          {previewText.slice(matchEnd)}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
