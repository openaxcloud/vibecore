import {
  Star,
  GitFork,
  Clock,
  Lock,
  Archive,
  GitBranch,
  Users,
  Database,
  Tag,
  Heart,
  ExternalLink,
  Circle,
  GitPullRequest,
} from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatRepositoryCardCopy,
  formatRepositoryCardNumber,
  formatRepositoryCardPercentage,
  formatRepositoryCardSize,
  formatRepositoryCardUpdatedAt,
  getRepositoryCardCopy,
  getRepositoryCardDaysSinceUpdate,
} from '~/lib/i18n/catalogs/repository-card';
import type { GitHubRepoInfo } from '~/types/GitHub';
import { classNames } from '~/utils/classNames';

interface RepositoryCardProps {
  repository: GitHubRepoInfo;
  variant?: 'default' | 'compact' | 'detailed';
  onSelect?: () => void;
  showHealthScore?: boolean;
  showExtendedMetrics?: boolean;
  className?: string;
}

export function RepositoryCard({
  repository,
  variant = 'default',
  onSelect,
  showHealthScore = false,
  showExtendedMetrics = false,
  className = '',
}: RepositoryCardProps) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getRepositoryCardCopy(language);
  const now = Date.now();
  const daysSinceUpdate = getRepositoryCardDaysSinceUpdate(repository.updated_at, now) ?? Number.POSITIVE_INFINITY;
  const updatedAtLabel = formatRepositoryCardUpdatedAt(repository.updated_at, language, now);

  const openLabel = formatRepositoryCardCopy(copy['repositoryCard.action.open'], {
    repository: repository.name,
  });

  const metricLabel = (label: string, value: string | number) =>
    formatRepositoryCardCopy(copy['repositoryCard.metrics.value'], { label, value });

  const calculateHealthScore = () => {
    const hasStars = repository.stargazers_count > 0;
    const hasRecentActivity = daysSinceUpdate < 30;
    const hasContributors = (repository.contributors_count || 0) > 1;
    const hasDescription = !!repository.description;
    const hasTopics = (repository.topics || []).length > 0;
    const hasLicense = !!repository.license;

    const healthScore = [hasStars, hasRecentActivity, hasContributors, hasDescription, hasTopics, hasLicense].filter(
      Boolean,
    ).length;

    const maxScore = 6;
    const percentage = Math.round((healthScore / maxScore) * 100);

    const getScoreColor = (score: number) => {
      if (score >= 5) {
        return 'text-green-500';
      }

      if (score >= 3) {
        return 'text-yellow-500';
      }

      return 'text-red-500';
    };

    return {
      percentage,
      color: getScoreColor(healthScore),
      score: healthScore,
      maxScore,
    };
  };

  const getHealthIndicatorColor = () => {
    const isActive = daysSinceUpdate < 7;
    const isHealthy = daysSinceUpdate < 30 && !repository.archived && repository.stargazers_count > 0;

    if (repository.archived) {
      return 'bg-[var(--vc-status-muted)]';
    }

    if (isActive) {
      return 'bg-green-500';
    }

    if (isHealthy) {
      return 'bg-blue-500';
    }

    return 'bg-yellow-500';
  };

  const getHealthTitle = () => {
    if (repository.archived) {
      return copy['repositoryCard.health.archived'];
    }

    if (daysSinceUpdate < 7) {
      return copy['repositoryCard.health.veryActive'];
    }

    if (daysSinceUpdate < 30 && repository.stargazers_count > 0) {
      return copy['repositoryCard.health.healthy'];
    }

    return copy['repositoryCard.health.needsAttention'];
  };

  const health = showHealthScore ? calculateHealthScore() : null;

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-label={openLabel}
        title={openLabel}
        className={classNames(
          'vc-focus-ring min-h-11 w-full min-w-0 rounded-lg border border-bolt-elements-borderColor p-3 text-left transition-all duration-200 hover:border-bolt-elements-borderColorActive hover:bg-bolt-elements-background-depth-1',
          className,
        )}
      >
        <div className="mb-2 flex min-w-0 flex-col gap-2 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h4 className="min-w-0 break-all text-sm font-medium text-bolt-elements-textPrimary">{repository.name}</h4>
            {repository.private && (
              <span
                className="shrink-0"
                title={copy['repositoryCard.status.private']}
                aria-label={copy['repositoryCard.status.private']}
              >
                <Lock className="h-3 w-3 text-bolt-elements-textTertiary" aria-hidden="true" />
              </span>
            )}
            {repository.fork && (
              <span
                className="shrink-0"
                title={copy['repositoryCard.status.forked']}
                aria-label={copy['repositoryCard.status.forked']}
              >
                <GitFork className="h-3 w-3 text-bolt-elements-textTertiary" aria-hidden="true" />
              </span>
            )}
            {repository.archived && (
              <span
                className="shrink-0"
                title={copy['repositoryCard.status.archived']}
                aria-label={copy['repositoryCard.status.archived']}
              >
                <Archive className="h-3 w-3 text-bolt-elements-textTertiary" aria-hidden="true" />
              </span>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-bolt-elements-textSecondary">
            <span
              className="flex items-center gap-1"
              title={metricLabel(
                copy['repositoryCard.metrics.stars'],
                formatRepositoryCardNumber(repository.stargazers_count, language),
              )}
              aria-label={metricLabel(
                copy['repositoryCard.metrics.stars'],
                formatRepositoryCardNumber(repository.stargazers_count, language),
              )}
            >
              <Star className="h-3 w-3" aria-hidden="true" />
              {formatRepositoryCardNumber(repository.stargazers_count, language)}
            </span>
            <span
              className="flex items-center gap-1"
              title={metricLabel(
                copy['repositoryCard.metrics.forks'],
                formatRepositoryCardNumber(repository.forks_count, language),
              )}
              aria-label={metricLabel(
                copy['repositoryCard.metrics.forks'],
                formatRepositoryCardNumber(repository.forks_count, language),
              )}
            >
              <GitFork className="h-3 w-3" aria-hidden="true" />
              {formatRepositoryCardNumber(repository.forks_count, language)}
            </span>
          </div>
        </div>

        {repository.description && (
          <p className="mb-2 line-clamp-2 break-words text-xs text-bolt-elements-textSecondary">
            {repository.description}
          </p>
        )}

        <div className="flex min-w-0 flex-col gap-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-bolt-elements-textTertiary">
            {repository.language && (
              <span
                className="flex min-w-0 items-center gap-1"
                title={metricLabel(copy['repositoryCard.metrics.primaryLanguage'], repository.language)}
                aria-label={metricLabel(copy['repositoryCard.metrics.primaryLanguage'], repository.language)}
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-current opacity-60" aria-hidden="true" />
                {repository.language}
              </span>
            )}
            {repository.size !== undefined && (
              <span
                title={metricLabel(
                  copy['repositoryCard.metrics.size'],
                  formatRepositoryCardSize(repository.size, language),
                )}
                aria-label={metricLabel(
                  copy['repositoryCard.metrics.size'],
                  formatRepositoryCardSize(repository.size, language),
                )}
              >
                {formatRepositoryCardSize(repository.size, language)}
              </span>
            )}
          </div>

          <span
            className="flex shrink-0 items-center gap-1 text-xs text-bolt-elements-textTertiary"
            title={metricLabel(copy['repositoryCard.metrics.lastUpdated'], updatedAtLabel)}
            aria-label={metricLabel(copy['repositoryCard.metrics.lastUpdated'], updatedAtLabel)}
          >
            <Clock className="h-3 w-3" aria-hidden="true" />
            {updatedAtLabel}
          </span>
        </div>
      </button>
    );
  }

  const Component = onSelect ? 'button' : 'div';

  const interactiveProps = onSelect
    ? {
        onClick: onSelect,
        type: 'button' as const,
        'aria-label': openLabel,
        title: openLabel,
        className: classNames(
          'group vc-focus-ring min-h-11 cursor-pointer text-left transition-all duration-200 hover:border-bolt-elements-borderColorActive dark:hover:border-bolt-elements-borderColorActive',
          className,
        ),
      }
    : { className };

  return (
    <Component
      {...interactiveProps}
      className={classNames(
        'relative block w-full min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4 dark:border-bolt-elements-borderColor dark:bg-bolt-elements-background-depth-1',
        interactiveProps.className,
      )}
    >
      {/* Repository Health Indicator */}
      {variant === 'detailed' && (
        <div
          className={`absolute right-2 top-2 h-2 w-2 rounded-full ${getHealthIndicatorColor()}`}
          title={formatRepositoryCardCopy(copy['repositoryCard.health.label'], { status: getHealthTitle() })}
          role="img"
          aria-label={formatRepositoryCardCopy(copy['repositoryCard.health.label'], { status: getHealthTitle() })}
        />
      )}

      <div className="space-y-3">
        <div className="flex min-w-0 flex-col gap-2 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2 pr-3">
            <GitBranch className="h-4 w-4 shrink-0 text-bolt-elements-icon-tertiary" aria-hidden="true" />
            <h5
              className={classNames(
                'min-w-0 break-all text-sm font-medium text-bolt-elements-textPrimary',
                onSelect && 'transition-colors group-hover:text-bolt-elements-item-contentAccent',
              )}
            >
              {repository.name}
            </h5>
            {repository.private && (
              <span
                className="shrink-0"
                title={copy['repositoryCard.status.private']}
                aria-label={copy['repositoryCard.status.private']}
              >
                <Lock className="h-3 w-3 text-bolt-elements-textTertiary" aria-hidden="true" />
              </span>
            )}
            {repository.fork && (
              <span
                className="shrink-0"
                title={copy['repositoryCard.status.forked']}
                aria-label={copy['repositoryCard.status.forked']}
              >
                <GitFork className="h-3 w-3 text-bolt-elements-textTertiary" aria-hidden="true" />
              </span>
            )}
            {repository.archived && (
              <span
                className="shrink-0"
                title={copy['repositoryCard.status.archived']}
                aria-label={copy['repositoryCard.status.archived']}
              >
                <Archive className="h-3 w-3 text-bolt-elements-textTertiary" aria-hidden="true" />
              </span>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-bolt-elements-textSecondary">
            <span
              className="flex items-center gap-1"
              title={metricLabel(
                copy['repositoryCard.metrics.stars'],
                formatRepositoryCardNumber(repository.stargazers_count, language),
              )}
              aria-label={metricLabel(
                copy['repositoryCard.metrics.stars'],
                formatRepositoryCardNumber(repository.stargazers_count, language),
              )}
            >
              <Star className="h-3.5 w-3.5 text-bolt-elements-icon-warning" aria-hidden="true" />
              {formatRepositoryCardNumber(repository.stargazers_count, language)}
            </span>
            <span
              className="flex items-center gap-1"
              title={metricLabel(
                copy['repositoryCard.metrics.forks'],
                formatRepositoryCardNumber(repository.forks_count, language),
              )}
              aria-label={metricLabel(
                copy['repositoryCard.metrics.forks'],
                formatRepositoryCardNumber(repository.forks_count, language),
              )}
            >
              <GitFork className="h-3.5 w-3.5 text-bolt-elements-icon-info" aria-hidden="true" />
              {formatRepositoryCardNumber(repository.forks_count, language)}
            </span>
            {showExtendedMetrics && repository.issues_count !== undefined && (
              <span
                className="flex items-center gap-1"
                title={metricLabel(
                  copy['repositoryCard.metrics.openIssues'],
                  formatRepositoryCardNumber(repository.issues_count, language),
                )}
                aria-label={metricLabel(
                  copy['repositoryCard.metrics.openIssues'],
                  formatRepositoryCardNumber(repository.issues_count, language),
                )}
              >
                <Circle className="h-3.5 w-3.5 text-bolt-elements-icon-error" aria-hidden="true" />
                {formatRepositoryCardNumber(repository.issues_count, language)}
              </span>
            )}
            {showExtendedMetrics && repository.pull_requests_count !== undefined && (
              <span
                className="flex items-center gap-1"
                title={metricLabel(
                  copy['repositoryCard.metrics.pullRequests'],
                  formatRepositoryCardNumber(repository.pull_requests_count, language),
                )}
                aria-label={metricLabel(
                  copy['repositoryCard.metrics.pullRequests'],
                  formatRepositoryCardNumber(repository.pull_requests_count, language),
                )}
              >
                <GitPullRequest className="h-3.5 w-3.5 text-bolt-elements-icon-success" aria-hidden="true" />
                {formatRepositoryCardNumber(repository.pull_requests_count, language)}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {repository.description && (
            <p className="line-clamp-2 break-words text-xs text-bolt-elements-textSecondary">
              {repository.description}
            </p>
          )}

          {/* Repository metrics bar */}
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
            {repository.license && (
              <span className="max-w-full break-all rounded-full bg-bolt-elements-background-depth-2 px-2 py-0.5 text-bolt-elements-textTertiary">
                {repository.license.spdx_id || repository.license.name}
              </span>
            )}
            {repository.topics &&
              repository.topics.slice(0, 2).map((topic) => (
                <span
                  key={topic}
                  className="max-w-full break-all rounded-full bg-blue-100 px-2 py-0.5 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
                >
                  {topic}
                </span>
              ))}
            {repository.archived && (
              <span className="rounded-full bg-bolt-elements-background-depth-3 px-2 py-0.5 text-bolt-elements-textSecondary">
                {copy['repositoryCard.badge.archived']}
              </span>
            )}
            {repository.fork && (
              <span className="rounded-full bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_12%,transparent)] px-2 py-0.5 text-[var(--vc-ide-accent-action)]">
                {copy['repositoryCard.badge.forked']}
              </span>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3 min-[420px]:flex-row min-[420px]:items-end min-[420px]:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-xs text-bolt-elements-textSecondary">
            <span
              className="flex min-w-0 items-center gap-1"
              title={metricLabel(copy['repositoryCard.metrics.defaultBranch'], repository.default_branch)}
              aria-label={metricLabel(copy['repositoryCard.metrics.defaultBranch'], repository.default_branch)}
            >
              <GitBranch className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="break-all">{repository.default_branch}</span>
            </span>
            {showExtendedMetrics && repository.branches_count !== undefined && (
              <span
                className="flex items-center gap-1"
                title={metricLabel(
                  copy['repositoryCard.metrics.totalBranches'],
                  formatRepositoryCardNumber(repository.branches_count, language),
                )}
                aria-label={metricLabel(
                  copy['repositoryCard.metrics.totalBranches'],
                  formatRepositoryCardNumber(repository.branches_count, language),
                )}
              >
                <GitFork className="h-3.5 w-3.5" aria-hidden="true" />
                {formatRepositoryCardNumber(repository.branches_count, language)}
              </span>
            )}
            {showExtendedMetrics && repository.contributors_count !== undefined && (
              <span
                className="flex items-center gap-1"
                title={metricLabel(
                  copy['repositoryCard.metrics.contributors'],
                  formatRepositoryCardNumber(repository.contributors_count, language),
                )}
                aria-label={metricLabel(
                  copy['repositoryCard.metrics.contributors'],
                  formatRepositoryCardNumber(repository.contributors_count, language),
                )}
              >
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                {formatRepositoryCardNumber(repository.contributors_count, language)}
              </span>
            )}
            {repository.size !== undefined && (
              <span
                className="flex items-center gap-1"
                title={metricLabel(
                  copy['repositoryCard.metrics.size'],
                  formatRepositoryCardSize(repository.size, language),
                )}
                aria-label={metricLabel(
                  copy['repositoryCard.metrics.size'],
                  formatRepositoryCardSize(repository.size, language),
                )}
              >
                <Database className="h-3.5 w-3.5" aria-hidden="true" />
                {formatRepositoryCardSize(repository.size, language)}
              </span>
            )}
            <span
              className="flex items-center gap-1"
              title={metricLabel(copy['repositoryCard.metrics.lastUpdated'], updatedAtLabel)}
              aria-label={metricLabel(copy['repositoryCard.metrics.lastUpdated'], updatedAtLabel)}
            >
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {updatedAtLabel}
            </span>
            {repository.topics && repository.topics.length > 0 && (
              <span
                className="flex items-center gap-1"
                title={formatRepositoryCardCopy(copy['repositoryCard.metrics.topics'], {
                  topics: repository.topics.join(', '),
                })}
                aria-label={formatRepositoryCardCopy(copy['repositoryCard.metrics.topics'], {
                  topics: repository.topics.join(', '),
                })}
              >
                <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                {formatRepositoryCardNumber(repository.topics.length, language)}
              </span>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* Repository Health Score */}
            {health && (
              <div
                className="flex items-center gap-1"
                title={formatRepositoryCardCopy(copy['repositoryCard.health.score'], {
                  percentage: formatRepositoryCardPercentage(health.percentage, language),
                  score: formatRepositoryCardNumber(health.score, language),
                  maximum: formatRepositoryCardNumber(health.maxScore, language),
                })}
                role="img"
                aria-label={formatRepositoryCardCopy(copy['repositoryCard.health.score'], {
                  percentage: formatRepositoryCardPercentage(health.percentage, language),
                  score: formatRepositoryCardNumber(health.score, language),
                  maximum: formatRepositoryCardNumber(health.maxScore, language),
                })}
              >
                <Heart className={`h-3.5 w-3.5 ${health.color}`} aria-hidden="true" />
                <span className={`text-xs font-medium ${health.color}`}>
                  {formatRepositoryCardPercentage(health.percentage, language)}
                </span>
              </div>
            )}

            {onSelect && (
              <span
                className={classNames(
                  'ml-2 flex items-center gap-1 transition-colors',
                  'group-hover:text-bolt-elements-item-contentAccent',
                )}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                {copy['repositoryCard.action.view']}
              </span>
            )}
          </div>
        </div>
      </div>
    </Component>
  );
}
