import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from './Badge';
import {
  formatSharedComponentsCopy,
  formatSharedComponentsPlural,
  formatSharedComponentsSize,
  getSharedComponentsCopy,
} from '~/lib/i18n/catalogs/shared-components';
import { classNames } from '~/utils/classNames';

interface RepositoryStatsProps {
  stats: {
    totalFiles?: number;
    totalSize?: number;
    languages?: Record<string, number>;
    hasPackageJson?: boolean;
    hasDependencies?: boolean;
  };
  className?: string;
  compact?: boolean;
}

const PACKAGE_MANIFEST_NAME = ['package', 'json'].join('.');

export function RepositoryStats({ stats, className, compact = false }: RepositoryStatsProps) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getSharedComponentsCopy(language);
  const { totalFiles, totalSize, languages, hasPackageJson, hasDependencies } = stats;

  return (
    <div className={classNames('space-y-3', className)}>
      {!compact && (
        <p className="text-sm font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark">
          {copy['repositoryStats.title']}
        </p>
      )}

      <div className={classNames('grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3')}>
        {totalFiles !== undefined && (
          <div className="flex items-center gap-2 text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark">
            <span className="i-ph:files text-bolt-elements-item-contentAccent w-4 h-4" />
            <span className={compact ? 'break-words text-xs' : 'break-words text-sm'}>
              {formatSharedComponentsCopy(copy['repositoryStats.files'], {
                count: new Intl.NumberFormat(language.startsWith('fr') ? 'fr-FR' : 'en-US').format(totalFiles),
              })}
            </span>
          </div>
        )}

        {totalSize !== undefined && (
          <div className="flex items-center gap-2 text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark">
            <span className="i-ph:database text-bolt-elements-item-contentAccent w-4 h-4" />
            <span className={compact ? 'break-words text-xs' : 'break-words text-sm'}>
              {formatSharedComponentsCopy(copy['repositoryStats.size'], {
                size: formatSharedComponentsSize(totalSize, language),
              })}
            </span>
          </div>
        )}
      </div>

      {languages && Object.keys(languages).length > 0 && (
        <div className={compact ? 'pt-1' : 'pt-2'}>
          <div className="flex items-center gap-2 text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark mb-2">
            <span className="i-ph:code text-bolt-elements-item-contentAccent w-4 h-4" />
            <span className={compact ? 'text-xs' : 'text-sm'}>{copy['repositoryStats.languages']}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(languages)
              .sort(([, a], [, b]) => b - a)
              .slice(0, compact ? 3 : 5)
              .map(([lang, size]) => (
                <Badge key={lang} variant="subtle" size={compact ? 'sm' : 'md'}>
                  {lang} ({formatSharedComponentsSize(size, language)})
                </Badge>
              ))}
            {Object.keys(languages).length > (compact ? 3 : 5) && (
              <Badge variant="subtle" size={compact ? 'sm' : 'md'}>
                {formatSharedComponentsPlural(language, Object.keys(languages).length - (compact ? 3 : 5), {
                  one: copy['repositoryStats.more_one'],
                  other: copy['repositoryStats.more_other'],
                })}
              </Badge>
            )}
          </div>
        </div>
      )}

      {(hasPackageJson || hasDependencies) && (
        <div className={compact ? 'pt-1' : 'pt-2'}>
          <div className="flex flex-wrap gap-2">
            {hasPackageJson && (
              <Badge variant="primary" size={compact ? 'sm' : 'md'} icon="i-ph:package w-3.5 h-3.5">
                {PACKAGE_MANIFEST_NAME}
              </Badge>
            )}
            {hasDependencies && (
              <Badge variant="primary" size={compact ? 'sm' : 'md'} icon="i-ph:tree-structure w-3.5 h-3.5">
                {copy['repositoryStats.dependencies']}
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
