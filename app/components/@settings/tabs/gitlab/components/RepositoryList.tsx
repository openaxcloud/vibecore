import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { RepositoryCard } from './RepositoryCard';
import { Button } from '~/components/ui/Button';
import {
  formatGitLabTabNumber,
  formatGitLabTabPlural,
  getGitLabTabCopy,
  interpolateGitLabTabCopy,
} from '~/lib/i18n/catalogs/gitlab-tab';
import type { GitLabProjectInfo } from '~/types/GitLab';

export function filterRepositories(repositories: GitLabProjectInfo[], searchQuery: string): GitLabProjectInfo[] {
  if (!searchQuery) {
    return repositories;
  }

  const query = searchQuery.toLowerCase();

  return repositories.filter(
    (repo) =>
      repo.name.toLowerCase().includes(query) ||
      repo.path_with_namespace.toLowerCase().includes(query) ||
      (repo.description ? repo.description.toLowerCase().includes(query) : false),
  );
}

interface RepositoryListProps {
  repositories: GitLabProjectInfo[];
  onClone?: (repo: GitLabProjectInfo) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const MAX_REPOS_PER_PAGE = 20;

export function RepositoryList({ repositories, onClone, onRefresh, isRefreshing }: RepositoryListProps) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getGitLabTabCopy(language);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredRepositories = useMemo(
    () => filterRepositories(repositories, searchQuery),
    [repositories, searchQuery],
  );

  const totalPages = Math.ceil(filteredRepositories.length / MAX_REPOS_PER_PAGE);
  const startIndex = (currentPage - 1) * MAX_REPOS_PER_PAGE;
  const endIndex = startIndex + MAX_REPOS_PER_PAGE;
  const currentRepositories = filteredRepositories.slice(startIndex, endIndex);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1); // Reset to first page when searching
  };

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h4 className="min-w-0 break-words text-sm font-medium text-bolt-elements-textPrimary [overflow-wrap:anywhere]">
          {formatGitLabTabPlural(language, filteredRepositories.length, {
            one: copy['gitLabTab.repositories.count_one'],
            other: copy['gitLabTab.repositories.count_other'],
          })}
        </h4>
        {onRefresh && (
          <Button
            onClick={onRefresh}
            disabled={isRefreshing}
            variant="outline"
            size="sm"
            className="!h-auto min-h-11 whitespace-normal break-words py-2 text-center"
            aria-label={
              isRefreshing ? copy['gitLabTab.repositories.refreshing'] : copy['gitLabTab.repositories.refresh']
            }
          >
            {isRefreshing ? (
              <div className="i-ph:spinner animate-spin w-4 h-4" />
            ) : (
              <div className="i-ph:arrows-clockwise w-4 h-4" />
            )}
            {isRefreshing ? copy['gitLabTab.repositories.refreshing'] : copy['gitLabTab.repositories.refresh']}
          </Button>
        )}
      </div>

      {/* Search Input */}
      <div className="relative min-w-0">
        <input
          type="search"
          placeholder={copy['gitLabTab.repositories.searchPlaceholder']}
          aria-label={copy['gitLabTab.repositories.searchLabel']}
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="min-h-11 w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-2 pl-10 text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorActive"
        />
        <div className="absolute left-3 top-1/2 -translate-y-1/2">
          <div className="i-ph:magnifying-glass w-4 h-4 text-bolt-elements-textSecondary" />
        </div>
      </div>

      {/* Repository Grid */}
      <div className="space-y-4">
        {filteredRepositories.length === 0 ? (
          <div
            className="break-words py-8 text-center text-bolt-elements-textSecondary [overflow-wrap:anywhere]"
            role="status"
          >
            {searchQuery ? copy['gitLabTab.repositories.emptySearch'] : copy['gitLabTab.repositories.empty']}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentRepositories.map((repo) => (
                <RepositoryCard key={repo.id} repo={repo} onClone={onClone} />
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex min-w-0 flex-col gap-3 border-t border-bolt-elements-borderColor pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 break-words text-sm text-bolt-elements-textSecondary [overflow-wrap:anywhere]">
                  {formatGitLabTabPlural(
                    language,
                    filteredRepositories.length,
                    {
                      one: copy['gitLabTab.repositories.range_one'],
                      other: copy['gitLabTab.repositories.range_other'],
                    },
                    {
                      start: formatGitLabTabNumber(Math.min(startIndex + 1, filteredRepositories.length), language),
                      end: formatGitLabTabNumber(Math.min(endIndex, filteredRepositories.length), language),
                    },
                  )}
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
                  <Button
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    variant="outline"
                    size="sm"
                    className="!h-auto min-h-11 whitespace-normal py-2 text-center"
                  >
                    <div className="i-ph:caret-left w-4 h-4" />
                    {copy['gitLabTab.repositories.previous']}
                  </Button>
                  <span className="break-words px-1 text-center text-sm text-bolt-elements-textSecondary [overflow-wrap:anywhere] sm:px-3">
                    {interpolateGitLabTabCopy(copy['gitLabTab.repositories.page'], {
                      current: formatGitLabTabNumber(currentPage, language),
                      total: formatGitLabTabNumber(totalPages, language),
                    })}
                  </span>
                  <Button
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    variant="outline"
                    size="sm"
                    className="!h-auto min-h-11 whitespace-normal py-2 text-center"
                  >
                    {copy['gitLabTab.repositories.next']}
                    <div className="i-ph:caret-right w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
