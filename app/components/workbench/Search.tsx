import type { FileSearchOptions } from '@vibecore/runtime-contract';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';
import { runtimeAdapter } from '~/lib/runtime/RuntimeAdapterProvider';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [isRegex, setIsRegex] = useState(false);
  const [searchResults, setSearchResults] = useState<DisplayMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | undefined>(undefined);

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
        setSearchError(undefined);

        return;
      }

      setIsSearching(true);
      setSearchResults([]);
      setExpandedFiles({});
      setHasSearched(true);
      setSearchError(undefined);

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
        console.error('Failed to initiate search:', error);
        setSearchError(
          error instanceof Error
            ? `Search failed: ${error.message}. The workspace runtime may still be starting — try again in a moment.`
            : 'Search failed. The workspace runtime may still be starting — try again in a moment.',
        );
      } finally {
        const elapsed = Date.now() - start;

        if (elapsed < minLoaderTime) {
          setTimeout(() => setIsSearching(false), minLoaderTime - elapsed);
        } else {
          setIsSearching(false);
        }
      }
    },
    [caseSensitive, isRegex],
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

  const replaceAll = useCallback(async () => {
    if (!searchQuery.trim() || searchResults.length === 0) {
      return;
    }

    let matcher: RegExp;

    try {
      matcher = new RegExp(
        isRegex ? searchQuery : searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        caseSensitive ? 'g' : 'gi',
      );
    } catch {
      toast.error('Invalid regular expression');
      return;
    }

    const confirmed = window.confirm(
      `Replace ${searchResults.length} match${searchResults.length === 1 ? '' : 'es'} across ${Object.keys(groupedResults).length} file${Object.keys(groupedResults).length === 1 ? '' : 's'}?`,
    );

    if (!confirmed) {
      return;
    }

    setIsReplacing(true);

    try {
      const files = workbenchStore.files.get();

      const targetPaths = [
        ...new Set(searchResults.map((result) => resolveWorkbenchPath(result.path)).filter(Boolean)),
      ] as string[];

      let replacementCount = 0;

      for (const filePath of targetPaths) {
        const entry = files[filePath];

        if (entry?.type !== 'file' || entry.isBinary) {
          continue;
        }

        const nextContent = entry.content.replace(matcher, () => {
          replacementCount += 1;
          return replaceQuery;
        });

        if (nextContent !== entry.content) {
          await workbenchStore.writeFileContent(filePath, nextContent);
        }
      }

      toast.success(`Replaced ${replacementCount} match${replacementCount === 1 ? '' : 'es'}`);
      await handleSearch(searchQuery);
    } catch (error) {
      console.error('Failed to replace results:', error);
      toast.error('Replace failed');
    } finally {
      setIsReplacing(false);
    }
  }, [
    caseSensitive,
    groupedResults,
    handleSearch,
    isRegex,
    replaceQuery,
    resolveWorkbenchPath,
    searchQuery,
    searchResults,
  ]);

  return (
    <div className="flex flex-col h-full bg-bolt-elements-background-depth-2">
      {/* Search Bar */}
      <div className="space-y-2 border-b border-bolt-elements-borderColor px-3 py-3">
        <div className="relative flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files"
            aria-label="Search files"
            className="w-full px-2 py-1 rounded-md bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:outline-none transition-all"
          />
          <button
            type="button"
            aria-label="Toggle case sensitive search"
            title="Match case"
            onClick={() => setCaseSensitive((value) => !value)}
            className={`h-7 rounded px-2 text-xs ${caseSensitive ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent' : 'text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3'}`}
          >
            Aa
          </button>
          <button
            type="button"
            aria-label="Toggle regular expression search"
            title="Use regular expression"
            onClick={() => setIsRegex((value) => !value)}
            className={`h-7 rounded px-2 text-xs ${isRegex ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent' : 'text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-3'}`}
          >
            .*
          </button>
        </div>
        <div className="relative flex items-center gap-2">
          <input
            type="text"
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            placeholder="Replace"
            aria-label="Replace with"
            className="w-full px-2 py-1 rounded-md bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:outline-none transition-all"
          />
          <button
            type="button"
            className="h-7 whitespace-nowrap rounded-md bg-bolt-elements-item-backgroundAccent px-2 text-xs font-medium text-bolt-elements-item-contentAccent disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isReplacing || searchResults.length === 0}
            onClick={() => void replaceAll()}
          >
            {isReplacing ? 'Replacing...' : 'Replace all'}
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto py-2">
        {isSearching && (
          <div className="flex items-center justify-center h-32 text-bolt-elements-textTertiary">
            <div className="i-ph:circle-notch animate-spin mr-2" /> Searching...
          </div>
        )}
        {!isSearching && searchError && (
          <div className="flex items-center justify-center h-32 px-4 text-center text-sm text-bolt-elements-icon-error">
            {searchError}
          </div>
        )}
        {!isSearching &&
          !searchError &&
          hasSearched &&
          searchResults.length === 0 &&
          searchQuery.trim() !== '' && (
            <div className="flex items-center justify-center h-32 text-gray-500">No results found.</div>
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
                        className="hover:bg-bolt-elements-background-depth-3 cursor-pointer transition-colors pl-6 py-1"
                        onClick={() => handleResultClick(match.path, match.lineNumber)}
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
