import { motion } from 'framer-motion';
import { Search, RefreshCw, GitBranch, Calendar, Filter } from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { RepositoryCard } from './RepositoryCard';
import { shouldShowRepositorySpinner } from './gitlabRepositorySelectorState';
import { BranchSelector } from '~/components/ui/BranchSelector';
import { Button } from '~/components/ui/Button';
import { useGitLabConnection } from '~/lib/hooks';
import {
  formatRepositorySelectorCopy,
  formatRepositorySelectorNumber,
  getRepositorySelectorCopy,
  getRepositorySelectorError,
} from '~/lib/i18n/catalogs/repository-selector';
import type { GitLabProjectInfo } from '~/types/GitLab';
import { classNames } from '~/utils/classNames';

interface GitLabRepositorySelectorProps {
  onClone?: (repoUrl: string, branch?: string) => void;
  className?: string;
}

type SortOption = 'updated' | 'stars' | 'name' | 'created';
type FilterOption = 'all' | 'owned' | 'member';

export function GitLabRepositorySelector({ onClone, className }: GitLabRepositorySelectorProps) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const copy = getRepositorySelectorCopy(language);

  const text = (template: string, values: Readonly<Record<string, string | number>> = {}) =>
    formatRepositorySelectorCopy(template, values);

  const { connection, isConnected } = useGitLabConnection();
  const [repositories, setRepositories] = useState<GitLabProjectInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('updated');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<GitLabProjectInfo | null>(null);
  const [isBranchSelectorOpen, setIsBranchSelectorOpen] = useState(false);

  const REPOS_PER_PAGE = 12;

  // Fetch repositories
  const fetchRepositories = async (refresh = false) => {
    if (!isConnected || !connection?.token) {
      return;
    }

    const loadingState = refresh ? setIsRefreshing : setIsLoading;
    loadingState(true);
    setError(null);

    try {
      const response = await fetch('/api/gitlab-projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: connection.token,
          gitlabUrl: connection.gitlabUrl || 'https://gitlab.com',
        }),
      });

      if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({ error: copy['repositorySelector.fetchFailed'] }));
        throw new Error(errorData.error || copy['repositorySelector.fetchFailed']);
      }

      const data: any = await response.json();
      setRepositories(data.projects || []);
    } catch (err) {
      console.error('Failed to fetch GitLab repositories:', err);
      setError(err instanceof Error ? err.message : '');

      // Fallback to empty array on error
      setRepositories([]);
    } finally {
      loadingState(false);
      setHasFetched(true);
    }
  };

  // Filter and search repositories
  const filteredRepositories = useMemo(() => {
    if (!repositories) {
      return [];
    }

    const filtered = repositories.filter((repo: GitLabProjectInfo) => {
      // Search filter
      const matchesSearch =
        !searchQuery ||
        repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        repo.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        repo.path_with_namespace.toLowerCase().includes(searchQuery.toLowerCase());

      // Type filter
      let matchesFilter = true;

      switch (filterBy) {
        case 'owned':
          // This would need owner information from the API response
          matchesFilter = true; // For now, show all
          break;
        case 'member':
          // This would need member information from the API response
          matchesFilter = true; // For now, show all
          break;
        case 'all':
        default:
          matchesFilter = true;
          break;
      }

      return matchesSearch && matchesFilter;
    });

    // Sort repositories
    filtered.sort((a: GitLabProjectInfo, b: GitLabProjectInfo) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'stars':
          return b.star_count - a.star_count;
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

  const handleRefresh = () => {
    fetchRepositories(true);
  };

  const handleCloneRepository = (repo: GitLabProjectInfo) => {
    setSelectedRepo(repo);
    setIsBranchSelectorOpen(true);
  };

  const handleBranchSelect = (branch: string) => {
    if (onClone && selectedRepo) {
      onClone(selectedRepo.http_url_to_repo, branch);
    }

    setSelectedRepo(null);
  };

  const handleCloseBranchSelector = () => {
    setIsBranchSelectorOpen(false);
    setSelectedRepo(null);
  };

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortBy, filterBy]);

  // Fetch repositories when connection is ready
  useEffect(() => {
    if (isConnected && connection?.token) {
      fetchRepositories();
    }
  }, [isConnected, connection?.token]);

  if (!isConnected || !connection) {
    return (
      <div className="text-center p-8">
        <p className="text-bolt-elements-textSecondary mb-4">
          {text(copy['repositorySelector.connect'], {
            provider: copy['repositorySelector.clone.provider.gitlab'],
          })}
        </p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {copy['repositorySelector.refreshConnection']}
        </Button>
      </div>
    );
  }

  if (error && !repositories.length) {
    return (
      <div className="text-center p-8">
        <div className="text-red-500 mb-4">
          <GitBranch className="w-12 h-12 mx-auto mb-2" />
          <p className="font-medium">{copy['repositorySelector.loadFailed']}</p>
          <p className="text-sm text-bolt-elements-textSecondary mt-1">
            {getRepositorySelectorError(
              language,
              error ? new Error(error) : undefined,
              copy['repositorySelector.fetchFailed'],
            )}
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={classNames('w-4 h-4 mr-2', { 'animate-spin': isRefreshing })} />
          {copy['repositorySelector.tryAgain']}
        </Button>
      </div>
    );
  }

  if (shouldShowRepositorySpinner({ isLoading, hasFetched, repositoryCount: repositories.length })) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <div className="animate-spin w-8 h-8 border-2 border-bolt-elements-borderColorActive border-t-transparent rounded-full" />
        <p className="text-sm text-bolt-elements-textSecondary">{copy['repositorySelector.loading']}</p>
      </div>
    );
  }

  if (!repositories.length && !isLoading && hasFetched) {
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
            <option value="owned">{copy['repositorySelector.filter.owned']}</option>
            <option value="member">{copy['repositorySelector.filter.member']}</option>
          </select>
        </div>
      </div>

      {/* Repository Grid */}
      {currentRepositories.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {currentRepositories.map((repo) => (
              <div key={repo.id} className="relative">
                <RepositoryCard repo={repo} onClone={() => handleCloneRepository(repo)} />
              </div>
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
      {selectedRepo && (
        <BranchSelector
          provider="gitlab"
          repoOwner={selectedRepo.path_with_namespace.split('/')[0] ?? ''}
          repoName={selectedRepo.path_with_namespace.split('/')[1] ?? ''}
          projectId={selectedRepo.id}
          token={connection?.token || ''}
          gitlabUrl={connection?.gitlabUrl}
          defaultBranch={selectedRepo.default_branch}
          onBranchSelect={handleBranchSelect}
          onClose={handleCloseBranchSelector}
          isOpen={isBranchSelectorOpen}
        />
      )}
    </motion.div>
  );
}
