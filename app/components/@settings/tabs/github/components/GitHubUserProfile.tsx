import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatGitHubProfileMetric,
  formatSettingsConnectorsResidualCopy,
  getSettingsConnectorsResidualCopy,
} from '~/lib/i18n/catalogs/settings-connectors-residual';
import type { GitHubUserResponse } from '~/types/GitHub';
import { classNames } from '~/utils/classNames';

interface GitHubUserProfileProps {
  user: GitHubUserResponse;
  className?: string;
}

export function GitHubUserProfile({ user, className = '' }: GitHubUserProfileProps) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getSettingsConnectorsResidualCopy(language);

  return (
    <div
      className={classNames(
        'flex min-w-0 flex-col items-start gap-4 rounded-lg bg-bolt-elements-background-depth-1 p-4 sm:flex-row sm:items-center',
        className,
      )}
      aria-label={formatSettingsConnectorsResidualCopy(copy['settingsResidual.githubProfile.label'], {
        account: user.login,
      })}
    >
      <img
        src={user.avatar_url}
        alt={formatSettingsConnectorsResidualCopy(copy['settingsResidual.githubProfile.avatarAlt'], {
          account: user.login,
        })}
        className="h-12 w-12 shrink-0 rounded-full border-2 border-bolt-elements-item-contentAccent dark:border-bolt-elements-item-contentAccent"
      />
      <div className="min-w-0 flex-1">
        <h4 className="break-words text-sm font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
          {user.name || user.login}
        </h4>
        <p className="break-all text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
          @{user.login}
        </p>
        {user.bio && (
          <p className="mt-1 break-words text-xs text-bolt-elements-textTertiary dark:text-bolt-elements-textTertiary">
            {user.bio}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-bolt-elements-textSecondary">
          <span className="flex min-w-0 items-center gap-1">
            <span className="i-ph:users h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="break-words">{formatGitHubProfileMetric('followers', user.followers, language)}</span>
          </span>
          <span className="flex min-w-0 items-center gap-1">
            <span className="i-ph:folder h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="break-words">
              {formatGitHubProfileMetric('repositories', user.public_repos, language)}
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-1">
            <span className="i-ph:file-text h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="break-words">{formatGitHubProfileMetric('gists', user.public_gists, language)}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
