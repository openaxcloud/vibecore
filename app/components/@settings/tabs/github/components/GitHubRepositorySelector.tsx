import { motion, AnimatePresence } from 'framer-motion';
import { Search, RefreshCw, GitBranch, Calendar, Filter, Check, Shield, Star, X } from 'lucide-react';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { GitHubRepositoryCard } from './GitHubRepositoryCard';
import { resolveCloneBranches, type CloneBranchInfo } from './githubBranches';
import { Button } from '~/components/ui/Button';
import { useGitHubConnection, useGitHubStats } from '~/lib/hooks';
import {
  formatRepositorySelectorCopy,
  formatRepositorySelectorNumber,
  getRepositorySelectorCopy,
  getRepositorySelectorError,
} from '~/lib/i18n/catalogs/repository-selector';
import type { GitHubRepoInfo } from '~/types/GitHub';
import { classNames } from '~/utils/classNames';

interface GitHubRepositorySelectorProps {
  onClone?: (repoUrl: string, branch?: string) => void;
  className?: string;
}

type SortOption = 'updated' | 'stars' | 'name' | 'created';
type FilterOption = 'all' | 'own' | 'forks' | 'archived';

/**
 * Clamp a page number into the valid 1..totalPages range. Used to keep the user
 * off a stranded, now-empty paginated page after the repo list shrinks (Refresh,
 * filter, or cache update) — there'd otherwise be no pagination UI to escape it.
 */
export function clampPage(currentPage: number, totalPages: number): number {
  if (totalPages < 1) {
    return 1;
  }

  if (currentPage > totalPages) {
    return totalPages;
  }

  if (currentPage < 1) {
    return 1;
  }

  return currentPage;
}

export function GitHubRepositorySelector({ onClone, className }: GitHubRepositorySelectorProps) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const copy = getRepositorySelectorCopy(language);

  const text = (template: string, values: Readonly<Record<string, string | number>> = {}) =>
    formatRepositorySelectorCopy(template, values);

  const { connection, isConnected } = useGitHubConnection();

  const {
    stats,
    isLoading: isStatsLoading,
    refreshStats,
  } = useGitHubStats(
    connection,
    {
      autoFetch: true,
      cacheTimeout: 30 * 60 * 1000, // 30 minutes
    },
    !connection?.token,
  ); // Use server-side if no token (OAuth-connected users have no client token)

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('updated');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepoInfo | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isBranchSelectorOpen, setIsBranchSelectorOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Branch selector modal state (resolved via githubBranches helper so it works
   * for both legacy client-token and OAuth/server-side connections).
   */
  const [branches, setBranches] = useState<CloneBranchInfo[]>([]);
  const [branchSearchQuery, setBranchSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [isBranchesLoading, setIsBranchesLoading] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);

  /*
   * Sequence guard: only the latest in-flight branch fetch may apply its
   * results, so a slow repo-A response can't overwrite a freshly-loaded
   * repo-B list.
   */
  const branchFetchSeqRef = useRef(0);

  const repositories = stats?.repos || [];
  const REPOS_PER_PAGE = 12;

  // Filter and search repositories
  const filteredRepositories = useMemo(() => {
    if (!repositories) {
      return [];
    }

    const filtered = repositories.filter((repo: GitHubRepoInfo) => {
      // Search filter
      const matchesSearch =
        !searchQuery ||
        repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        repo.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        repo.full_name.toLowerCase().includes(searchQuery.toLowerCase());

      // Type filter
      let matchesFilter = true;

      switch (filterBy) {
        case 'own':
          matchesFilter = !repo.fork;
          break;
        case 'forks':
          matchesFilter = repo.fork === true;
          break;
        case 'archived':
          matchesFilter = repo.archived === true;
          break;
        case 'all':
        default:
          matchesFilter = true;
          break;
      }

      return matchesSearch && matchesFilter;
    });

    // Sort repositories
    filtered.sort((a: GitHubRepoInfo, b: GitHubRepoInfo) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'stars':
          return b.stargazers_count - a.stargazers_count;
        case 'created':
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(); // Using updated_at as proxy
        case 'updated':
        default:
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
    });

    return filtered;
  }, [repositories, searchQuery, sortBy, filterBy]);

  // Pagination
  const totalPages = Math.ceil(filteredRepositories.length / REPOS_PER_PAGE);
  const startIndex = (currentPage - 1) * REPOS_PER_PAGE;
  const currentRepositories = filteredRepositories.slice(startIndex, startIndex + REPOS_PER_PAGE);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError(null);

    try {
      await refreshStats();
    } catch (err) {
      console.error('Failed to refresh GitHub repositories:', err);
      setError(err instanceof Error ? err.message : '');
    } finally {
      setIsRefreshing(false);
    }
  };

  const fetchBranchesForRepo = async (repo: GitHubRepoInfo) => {
    const seq = ++branchFetchSeqRef.current;
    setIsBranchesLoading(true);
    setBranchError(null);

    try {
      const { branches: resolved, defaultBranch } = await resolveCloneBranches(
        connection,
        repo.full_name,
        repo.default_branch,
      );

      if (seq !== branchFetchSeqRef.current) {
        return;
      }

      setBranches(resolved);
      setBranchSearchQuery('');
      setSelectedBranch(defaultBranch || repo.default_branch || 'main');
    } catch (err) {
      if (seq !== branchFetchSeqRef.current) {
        return;
      }

      console.error('Failed to fetch branches:', err);
      setBranchError(err instanceof Error ? err.message : '');
      setBranches([]);
    } finally {
      if (seq === branchFetchSeqRef.current) {
        setIsBranchesLoading(false);
      }
    }
  };

  const handleCloneRepository = (repo: GitHubRepoInfo) => {
    setSelectedRepo(repo);
    setIsBranchSelectorOpen(true);
    setBranches([]);
    setBranchError(null);
    setSelectedBranch('');
    fetchBranchesForRepo(repo);
  };

  const handleConfirmBranchSelection = () => {
    if (onClone && selectedRepo && selectedBranch) {
      const cloneUrl = selectedRepo.html_url + '.git';
      onClone(cloneUrl, selectedBranch);
    }

    setIsBranchSelectorOpen(false);
    setSelectedRepo(null);
  };

  const handleCloseBranchSelector = () => {
    setIsBranchSelectorOpen(false);
    setSelectedRepo(null);
    setBranchError(null);
  };

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortBy, filterBy]);

  /*
   * Clamp the current page when the underlying list shrinks (e.g. after a
   * Refresh or cache update) so the user is never stranded on a now-empty page
   * with no pagination controls to navigate back from.
   */
  useEffect(() => {
    const clamped = clampPage(currentPage, totalPages);

    if (clamped !== currentPage) {
      setCurrentPage(clamped);
    }
  }, [currentPage, totalPages]);

  // Esc closes the branch selector modal.
  useEffect(() => {
    if (!isBranchSelectorOpen) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCloseBranchSelector();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isBranchSelectorOpen]);

  const filteredBranches = branches.filter((branch) =>
    branch.name.toLowerCase().includes(branchSearchQuery.toLowerCase()),
  );

  if (!isConnected || !connection) {
    return (
      <div className="text-center p-8">
        <p className="text-bolt-elements-textSecondary mb-4">
          {text(copy['repositorySelector.connect'], {
            provider: copy['repositorySelector.clone.provider.github'],
          })}
        </p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {copy['repositorySelector.refreshConnection']}
        </Button>
      </div>
    );
  }

  if (isStatsLoading && !stats) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <div className="animate-spin w-8 h-8 border-2 border-bolt-elements-borderColorActive border-t-transparent rounded-full" />
        <p className="text-sm text-bolt-elements-textSecondary">{copy['repositorySelector.loading']}</p>
      </div>
    );
  }

  if (error && !repositories.length) {
    return (
      <div className="text-center p-8" role="alert">
        <GitBranch className="w-12 h-12 text-bolt-elements-textTertiary mx-auto mb-4" />
        <p className="text-bolt-elements-textPrimary font-medium mb-1">{copy['repositorySelector.loadFailed']}</p>
        <p className="text-sm text-bolt-elements-textSecondary mb-4">
          {getRepositorySelectorError(
            language,
            error ? new Error(error) : undefined,
            copy['repositorySelector.fetchFailed'],
          )}
        </p>
        <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={classNames('w-4 h-4 mr-2', { 'animate-spin': isRefreshing })} />
          {copy['repositorySelector.retry']}
        </Button>
      </div>
    );
  }

  if (!repositories.length) {
    return (
      <div className="text-center p-8">
        <GitBranch className="w-12 h-12 text-bolt-elements-textTertiary mx-auto mb-4" />
        <p className="text-bolt-elements-textSecondary mb-4">{copy['repositorySelector.empty']}</p>
        <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={classNames('w-4 h-4 mr-2', { 'animate-spin': isRefreshing })} />
          {copy['repositorySelector.refresh']}
        </Button>
      </div>
    );
  }

  return (
    <motion.div
      className={classNames('space-y-6', className)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-bolt-elements-textPrimary">{copy['repositorySelector.title']}</h3>
          <p className="text-sm text-bolt-elements-textSecondary">
            {text(copy['repositorySelector.count'], {
              shown: formatRepositorySelectorNumber(filteredRepositories.length, language),
              total: formatRepositorySelectorNumber(repositories.length, language),
            })}
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={isRefreshing}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <RefreshCw className={classNames('w-4 h-4', { 'animate-spin': isRefreshing })} />
          {copy['repositorySelector.refresh']}
        </Button>
      </div>

      {error && repositories.length > 0 && (
        <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-700">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            {text(copy['repositorySelector.warningCached'], {
              reason: getRepositorySelectorError(
                language,
                error ? new Error(error) : undefined,
                copy['repositorySelector.fetchFailed'],
              ),
            })}
          </p>
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-bolt-elements-textTertiary" />
          <input
            type="text"
            aria-label={copy['repositorySelector.searchAria']}
            placeholder={copy['repositorySelector.searchPlaceholder']}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorActive"
          />
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-bolt-elements-textTertiary" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-3 py-2 rounded-lg bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary text-sm focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorActive"
          >
            <option value="updated">{copy['repositorySelector.sort.updated']}</option>
            <option value="stars">{copy['repositorySelector.sort.stars']}</option>
            <option value="name">{copy['repositorySelector.sort.name']}</option>
            <option value="created">{copy['repositorySelector.sort.created']}</option>
          </select>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-bolt-elements-textTertiary" />
          <select
            value={filterBy}
            onChange={(e) => setFilterBy(e.target.value as FilterOption)}
            className="px-3 py-2 rounded-lg bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary text-sm focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorActive"
          >
            <option value="all">{copy['repositorySelector.filter.all']}</option>
            <option value="own">{copy['repositorySelector.filter.own']}</option>
            <option value="forks">{copy['repositorySelector.filter.forks']}</option>
            <option value="archived">{copy['repositorySelector.filter.archived']}</option>
          </select>
        </div>
      </div>

      {/* Repository Grid */}
      {currentRepositories.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {currentRepositories.map((repo) => (
              <GitHubRepositoryCard key={repo.id} repo={repo} onClone={() => handleCloneRepository(repo)} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-bolt-elements-borderColor">
              <div className="text-sm text-bolt-elements-textSecondary">
                {text(copy['repositorySelector.pagination.range'], {
                  start: formatRepositorySelectorNumber(
                    Math.min(startIndex + 1, filteredRepositories.length),
                    language,
                  ),
                  end: formatRepositorySelectorNumber(
                    Math.min(startIndex + REPOS_PER_PAGE, filteredRepositories.length),
                    language,
                  ),
                  total: formatRepositorySelectorNumber(filteredRepositories.length, language),
                })}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  variant="outline"
                  size="sm"
                >
                  {copy['repositorySelector.pagination.previous']}
                </Button>
                <span className="text-sm text-bolt-elements-textSecondary px-3">
                  {text(copy['repositorySelector.pagination.page'], {
                    current: formatRepositorySelectorNumber(currentPage, language),
                    total: formatRepositorySelectorNumber(totalPages, language),
                  })}
                </span>
                <Button
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  variant="outline"
                  size="sm"
                >
                  {copy['repositorySelector.pagination.next']}
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-8">
          <p className="text-bolt-elements-textSecondary">{copy['repositorySelector.noMatch']}</p>
        </div>
      )}

      {/* Branch Selector Modal */}
      <AnimatePresence>
        {isBranchSelectorOpen && selectedRepo && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={handleCloseBranchSelector}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              role="dialog"
              aria-modal="true"
              aria-label={copy['repositorySelector.branch.title']}
              onClick={(e) => e.stopPropagation()}
              className="bg-bolt-elements-background-depth-2 rounded-xl shadow-xl border border-bolt-elements-borderColor max-w-md w-full max-h-[80vh] flex flex-col"
            >
              {/* Header */}
              <div className="p-6 border-b border-bolt-elements-borderColor flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <GitBranch className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-bolt-elements-textPrimary">
                      {copy['repositorySelector.branch.title']}
                    </h3>
                    <p className="text-sm text-bolt-elements-textSecondary">{selectedRepo.full_name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={copy['repositorySelector.branch.close']}
                  title={copy['repositorySelector.branch.close']}
                  onClick={handleCloseBranchSelector}
                  className="p-2 rounded-lg hover:bg-bolt-elements-background-depth-1 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-all"
                >
                  <X className="w-5 h-5" aria-hidden />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden flex flex-col">
                {isBranchesLoading ? (
                  <div className="flex flex-col items-center justify-center p-8 space-y-4">
                    <div className="animate-spin w-8 h-8 border-2 border-bolt-elements-borderColorActive border-t-transparent rounded-full" />
                    <p className="text-sm text-bolt-elements-textSecondary">
                      {copy['repositorySelector.branch.loading']}
                    </p>
                  </div>
                ) : branchError ? (
                  <div className="flex flex-col items-center justify-center p-8 space-y-4" role="alert">
                    <div className="text-red-500 mb-2">
                      <GitBranch className="w-8 h-8 mx-auto" />
                    </div>
                    <p className="text-sm text-red-600 text-center">
                      {getRepositorySelectorError(
                        language,
                        branchError ? new Error(branchError) : undefined,
                        copy['repositorySelector.branch.loadFailed'],
                      )}
                    </p>
                    <Button onClick={() => fetchBranchesForRepo(selectedRepo)} variant="outline" size="sm">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      {copy['repositorySelector.retry']}
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Search */}
                    {branches.length > 10 && (
                      <div className="p-4 border-b border-bolt-elements-borderColor">
                        <input
                          type="text"
                          placeholder={copy['repositorySelector.branch.search']}
                          value={branchSearchQuery}
                          onChange={(e) => setBranchSearchQuery(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorActive"
                        />
                      </div>
                    )}

                    {/* Branch List */}
                    <div className="flex-1 overflow-y-auto">
                      {filteredBranches.length > 0 ? (
                        <div className="p-4 space-y-1">
                          {filteredBranches.map((branch) => (
                            <button
                              key={branch.name}
                              onClick={() => setSelectedBranch(branch.name)}
                              className={classNames(
                                'w-full text-left p-3 rounded-lg transition-all duration-200 border',
                                selectedBranch === branch.name
                                  ? 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-100'
                                  : 'bg-bolt-elements-background-depth-1 border-transparent hover:bg-bolt-elements-background-depth-2',
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                  <GitBranch className="w-4 h-4 flex-shrink-0 text-bolt-elements-textSecondary" />
                                  <span className="font-medium text-bolt-elements-textPrimary truncate">
                                    {branch.name}
                                  </span>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    {branch.isDefault && (
                                      <Star
                                        className="w-3 h-3 text-yellow-500"
                                        aria-label={copy['repositorySelector.branch.default']}
                                      />
                                    )}
                                    {branch.protected && (
                                      <Shield
                                        className="w-3 h-3 text-red-500"
                                        aria-label={copy['repositorySelector.branch.protected']}
                                      />
                                    )}
                                  </div>
                                </div>
                                {selectedBranch === branch.name && <Check className="w-4 h-4 text-blue-600" />}
                              </div>
                              {branch.sha && (
                                <div className="text-xs text-bolt-elements-textSecondary mt-1 truncate">
                                  {branch.sha.substring(0, 8)}
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center p-8">
                          <p className="text-sm text-bolt-elements-textSecondary">
                            {branchSearchQuery
                              ? copy['repositorySelector.branch.noMatch']
                              : copy['repositorySelector.branch.empty']}
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Footer */}
              {!isBranchesLoading && !branchError && branches.length > 0 && (
                <div className="p-6 border-t border-bolt-elements-borderColor flex items-center justify-between">
                  <div className="text-sm text-bolt-elements-textSecondary">
                    {selectedBranch && (
                      <>
                        {copy['repositorySelector.branch.selected']}{' '}
                        <span className="font-medium">{selectedBranch}</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Button onClick={handleCloseBranchSelector} variant="outline" size="sm">
                      {copy['repositorySelector.branch.cancel']}
                    </Button>
                    <Button
                      onClick={handleConfirmBranchSelection}
                      disabled={!selectedBranch}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {copy['repositorySelector.branch.clone']}
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
