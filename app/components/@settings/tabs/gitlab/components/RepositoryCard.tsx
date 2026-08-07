import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatRepositorySelectorDate,
  formatRepositorySelectorNumber,
  getRepositorySelectorCopy,
} from '~/lib/i18n/catalogs/repository-selector';
import type { GitLabProjectInfo } from '~/types/GitLab';

interface RepositoryCardProps {
  repo: GitLabProjectInfo;
  onClone?: (repo: GitLabProjectInfo) => void;
}

export function RepositoryCard({ repo, onClone }: RepositoryCardProps) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const copy = getRepositorySelectorCopy(language);

  return (
    <a
      key={repo.name}
      href={repo.http_url_to_repo}
      target="_blank"
      rel="noopener noreferrer"
      className="group block p-4 rounded-lg bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive transition-all duration-200"
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="i-ph:git-branch w-4 h-4 shrink-0 text-bolt-elements-icon-info" />
            <h5
              className="min-w-0 truncate text-sm font-medium text-bolt-elements-textPrimary group-hover:text-bolt-elements-item-contentAccent transition-colors"
              title={repo.name}
            >
              {repo.name}
            </h5>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs text-bolt-elements-textSecondary">
            <span className="flex items-center gap-1" title={copy['repositorySelector.card.stars']}>
              <div className="i-ph:star w-3.5 h-3.5 text-bolt-elements-icon-warning" />
              {formatRepositorySelectorNumber(repo.star_count, language)}
            </span>
            <span className="flex items-center gap-1" title={copy['repositorySelector.card.forks']}>
              <div className="i-ph:git-fork w-3.5 h-3.5 text-bolt-elements-icon-info" />
              {formatRepositorySelectorNumber(repo.forks_count, language)}
            </span>
          </div>
        </div>

        {repo.description && (
          <p className="text-xs text-bolt-elements-textSecondary line-clamp-2">{repo.description}</p>
        )}

        <div className="flex items-center gap-3 text-xs text-bolt-elements-textSecondary">
          <span className="flex items-center gap-1" title={copy['repositorySelector.card.defaultBranch']}>
            <div className="i-ph:git-branch w-3.5 h-3.5" />
            {repo.default_branch}
          </span>
          <span className="flex items-center gap-1" title={copy['repositorySelector.card.lastUpdated']}>
            <div className="i-ph:clock w-3.5 h-3.5" />
            {formatRepositorySelectorDate(repo.updated_at, language)}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            {onClone && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClone(repo);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
                title={copy['repositorySelector.card.cloneTitle']}
              >
                <div className="i-ph:git-branch w-3.5 h-3.5" />
                {copy['repositorySelector.card.clone']}
              </button>
            )}
            <span className="flex items-center gap-1 group-hover:text-bolt-elements-item-contentAccent transition-colors">
              <div className="i-ph:arrow-square-out w-3.5 h-3.5" />
              {copy['repositorySelector.card.view']}
            </span>
          </div>
        </div>
      </div>
    </a>
  );
}
