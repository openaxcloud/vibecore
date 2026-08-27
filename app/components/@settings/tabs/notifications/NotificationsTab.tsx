import { useStore } from '@nanostores/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { motion } from 'framer-motion';
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatNotificationsTabPlural,
  formatNotificationsTabRelativeTime,
  getNotificationsTabCategoryLabel,
  getNotificationsTabCopy,
  getNotificationsTabSafeMessage,
  interpolateNotificationsTabCopy,
} from '~/lib/i18n/catalogs/notifications-tab';
import { logStore } from '~/lib/stores/logs';
import { classNames } from '~/utils/classNames';

interface NotificationDetails {
  type?: string;
  message?: string;
  currentVersion?: string;
  latestVersion?: string;
  branch?: string;
  updateUrl?: string;
}

type FilterType = 'all' | 'system' | 'error' | 'warning' | 'update' | 'info' | 'provider' | 'network';

const NotificationsTab = () => {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const languageRef = useRef(language);
  languageRef.current = language;

  const copy = getNotificationsTabCopy(language);
  const [filter, setFilter] = useState<FilterType>('all');
  const logs = useStore(logStore.logs);
  const notificationCount = Object.keys(logs).length;

  useEffect(() => {
    const startTime = performance.now();

    return () => {
      const duration = performance.now() - startTime;
      logStore.logPerformanceMetric('NotificationsTab', 'mount-duration', duration, undefined, languageRef.current);
    };
  }, []);

  const handleClearNotifications = () => {
    const eventMessage = copy['notificationsTab.event.cleared'];
    logStore.logInfo(eventMessage, {
      type: 'notification_clear',
      message: eventMessage,
      clearedCount: notificationCount,
      component: 'notifications',
    });
    logStore.clearLogs();
  };

  const handleUpdateAction = (updateUrl: string) => {
    const eventMessage = copy['notificationsTab.event.updateOpened'];
    logStore.logInfo(eventMessage, {
      type: 'update_click',
      message: eventMessage,
      updateUrl,
      component: 'notifications',
    });
    window.open(updateUrl, '_blank', 'noopener,noreferrer');
  };

  const handleFilterChange = (newFilter: FilterType) => {
    const eventMessage = copy['notificationsTab.event.filterChanged'];
    logStore.logInfo(eventMessage, {
      type: 'filter_change',
      message: eventMessage,
      previousFilter: filter,
      newFilter,
      component: 'notifications',
    });
    setFilter(newFilter);
  };

  const filteredLogs = Object.values(logs)
    .filter((log) => {
      if (filter === 'all') {
        return true;
      }

      if (filter === 'update') {
        return log.details?.type === 'update';
      }

      if (filter === 'system') {
        return log.category === 'system';
      }

      if (filter === 'provider') {
        return log.category === 'provider';
      }

      if (filter === 'network') {
        return log.category === 'network';
      }

      return log.level === filter;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const getNotificationStyle = (level: string, type?: string) => {
    if (type === 'update') {
      return {
        icon: 'i-ph:arrow-circle-up',
        color: 'text-[var(--vc-ide-accent-action)]',
        bg: 'hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)]',
      };
    }

    switch (level) {
      case 'error':
        return {
          icon: 'i-ph:warning-circle',
          color: 'text-bolt-elements-icon-error',
          bg: 'hover:bg-[color-mix(in_srgb,var(--bolt-elements-icon-error)_10%,transparent)]',
        };
      case 'warning':
        return {
          icon: 'i-ph:warning',
          color: 'text-bolt-elements-icon-warning',
          bg: 'hover:bg-[color-mix(in_srgb,var(--bolt-elements-icon-warning)_10%,transparent)]',
        };
      case 'info':
        return {
          icon: 'i-ph:info',
          color: 'text-bolt-elements-icon-info',
          bg: 'hover:bg-[color-mix(in_srgb,var(--bolt-elements-icon-info)_10%,transparent)]',
        };
      default:
        return {
          icon: 'i-ph:bell',
          color: 'text-bolt-elements-textTertiary',
          bg: 'hover:bg-bolt-elements-background-depth-3',
        };
    }
  };

  const renderNotificationDetails = (details: NotificationDetails) => {
    if (details.type === 'update') {
      return (
        <div className="flex min-w-0 flex-col gap-2">
          {details.message ? (
            <p className="break-words text-sm text-bolt-elements-textSecondary">{details.message}</p>
          ) : null}
          <div className="flex flex-col gap-1 text-xs text-bolt-elements-textTertiary">
            {details.currentVersion ? (
              <p className="break-words">
                {interpolateNotificationsTabCopy(copy['notificationsTab.update.currentVersion'], {
                  version: details.currentVersion,
                })}
              </p>
            ) : null}
            {details.latestVersion ? (
              <p className="break-words">
                {interpolateNotificationsTabCopy(copy['notificationsTab.update.latestVersion'], {
                  version: details.latestVersion,
                })}
              </p>
            ) : null}
            {details.branch ? (
              <p className="break-words">
                {interpolateNotificationsTabCopy(copy['notificationsTab.update.branch'], {
                  branch: details.branch,
                })}
              </p>
            ) : null}
          </div>
          {details.updateUrl ? (
            <button
              type="button"
              onClick={() => handleUpdateAction(details.updateUrl!)}
              className={classNames(
                'vc-focus-ring mt-2 inline-flex min-h-11 max-w-full items-center justify-center gap-2 self-start',
                'rounded-lg px-3 py-2',
                'whitespace-normal text-left text-sm font-medium',
                'bg-bolt-elements-background-depth-2',
                'border border-bolt-elements-borderColor',
                'text-bolt-elements-textPrimary',
                'hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)]',
                'transition-all duration-200',
              )}
            >
              <span className="i-ph:git-branch shrink-0 text-lg" aria-hidden />
              <span className="break-words">{copy['notificationsTab.update.viewChanges']}</span>
            </button>
          ) : null}
        </div>
      );
    }

    return details.message ? (
      <p className="break-words text-sm text-bolt-elements-textSecondary">{details.message}</p>
    ) : null;
  };

  const filterOptions: { id: FilterType; label: string; icon: string; colorClass: string }[] = [
    {
      id: 'all',
      label: copy['notificationsTab.filter.all'],
      icon: 'i-ph:bell',
      colorClass: 'text-[var(--vc-ide-accent-action)]',
    },
    {
      id: 'system',
      label: copy['notificationsTab.filter.system'],
      icon: 'i-ph:gear',
      colorClass: 'text-bolt-elements-textTertiary',
    },
    {
      id: 'update',
      label: copy['notificationsTab.filter.update'],
      icon: 'i-ph:arrow-circle-up',
      colorClass: 'text-[var(--vc-ide-accent-action)]',
    },
    {
      id: 'error',
      label: copy['notificationsTab.filter.error'],
      icon: 'i-ph:warning-circle',
      colorClass: 'text-bolt-elements-icon-error',
    },
    {
      id: 'warning',
      label: copy['notificationsTab.filter.warning'],
      icon: 'i-ph:warning',
      colorClass: 'text-bolt-elements-icon-warning',
    },
    {
      id: 'info',
      label: copy['notificationsTab.filter.info'],
      icon: 'i-ph:info',
      colorClass: 'text-bolt-elements-icon-info',
    },
    {
      id: 'provider',
      label: copy['notificationsTab.filter.provider'],
      icon: 'i-ph:robot',
      colorClass: 'text-bolt-elements-icon-success',
    },
    {
      id: 'network',
      label: copy['notificationsTab.filter.network'],
      icon: 'i-ph:wifi-high',
      colorClass: 'text-bolt-elements-icon-accent',
    },
  ];

  const activeFilter = filterOptions.find((option) => option.id === filter);

  const emptyTitle =
    filter === 'all' ? copy['notificationsTab.empty.title'] : copy['notificationsTab.empty.filteredTitle'];
  const emptyDescription =
    filter === 'all' ? copy['notificationsTab.empty.description'] : copy['notificationsTab.empty.filteredDescription'];
  const clearNotificationsLabel = formatNotificationsTabPlural(language, notificationCount, {
    one: copy['notificationsTab.action.clearAria.one'],
    other: copy['notificationsTab.action.clearAria.other'],
  });

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label={interpolateNotificationsTabCopy(copy['notificationsTab.filter.aria'], {
                filter: activeFilter?.label ?? copy['notificationsTab.filter.fallback'],
              })}
              className={classNames(
                'vc-focus-ring flex min-h-11 w-full max-w-full items-center justify-center gap-2 sm:w-auto',
                'rounded-lg px-3 py-2',
                'whitespace-normal text-left text-sm text-bolt-elements-textPrimary',
                'bg-bolt-elements-background-depth-2',
                'border border-bolt-elements-borderColor',
                'hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)]',
                'transition-all duration-200',
              )}
            >
              <span
                className={classNames(
                  'shrink-0 text-lg',
                  activeFilter?.icon ?? 'i-ph:funnel',
                  activeFilter?.colorClass,
                )}
                aria-hidden
              />
              <span className="min-w-0 break-words">
                {activeFilter?.label ?? copy['notificationsTab.filter.fallback']}
              </span>
              <span className="i-ph:caret-down shrink-0 text-lg text-bolt-elements-textTertiary" aria-hidden />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="min-w-[min(200px,calc(100vw-24px))] max-w-[calc(100vw-24px)] max-h-[min(420px,calc(100dvh-24px))] overflow-auto bg-bolt-elements-background-depth-2 rounded-lg shadow-lg py-1 z-[250] animate-in fade-in-0 zoom-in-95 border border-bolt-elements-borderColor"
              sideOffset={5}
              align="start"
              side="bottom"
              collisionPadding={12}
              hideWhenDetached
            >
              {filterOptions.map((option) => (
                <DropdownMenu.Item
                  key={option.id}
                  aria-current={filter === option.id ? 'true' : undefined}
                  className="group flex min-h-11 cursor-pointer items-center px-4 py-2.5 text-sm text-bolt-elements-textSecondary outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)] focus:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)]"
                  onClick={() => handleFilterChange(option.id)}
                >
                  <div className="mr-3 flex h-5 w-5 items-center justify-center">
                    <span
                      className={classNames(
                        option.icon,
                        option.colorClass,
                        'text-lg transition-colors group-hover:text-[var(--vc-ide-accent-action)]',
                      )}
                      aria-hidden
                    />
                  </div>
                  <span className="break-words transition-colors group-hover:text-[var(--vc-ide-accent-action)]">
                    {option.label}
                  </span>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <button
          type="button"
          onClick={handleClearNotifications}
          disabled={notificationCount === 0}
          aria-label={clearNotificationsLabel}
          className={classNames(
            'vc-focus-ring group flex min-h-11 w-full items-center justify-center gap-2 sm:w-auto',
            'rounded-lg px-3 py-2',
            'whitespace-normal text-sm text-bolt-elements-textPrimary',
            'bg-bolt-elements-background-depth-2',
            'border border-bolt-elements-borderColor',
            'hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)]',
            'transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <span
            className="i-ph:trash shrink-0 text-lg text-bolt-elements-textTertiary transition-colors group-hover:text-[var(--vc-ide-accent-action)]"
            aria-hidden
          />
          <span className="break-words">{copy['notificationsTab.action.clearAll']}</span>
        </button>
      </div>

      <div
        className="flex min-w-0 flex-col gap-4"
        role={filteredLogs.length > 0 ? 'list' : undefined}
        aria-live="polite"
      >
        {filteredLogs.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            role="status"
            className={classNames(
              'flex flex-col items-center justify-center gap-4',
              'rounded-lg p-4 text-center sm:p-8',
              'bg-bolt-elements-background-depth-2',
              'border border-bolt-elements-borderColor',
            )}
          >
            <span className="i-ph:bell-slash text-4xl text-bolt-elements-textTertiary" aria-hidden />
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="break-words text-sm font-medium text-bolt-elements-textPrimary">{emptyTitle}</h3>
              <p className="break-words text-sm text-bolt-elements-textTertiary">{emptyDescription}</p>
            </div>
          </motion.div>
        ) : (
          filteredLogs.map((log) => {
            const style = getNotificationStyle(log.level, log.details?.type);
            const isTechnicalError = log.level === 'error' || log.category === 'error';
            const categoryLabel = getNotificationsTabCategoryLabel(log.category, language);

            const categoryValue = `${categoryLabel}${
              !isTechnicalError && log.subCategory ? ` > ${log.subCategory}` : ''
            }`;

            return (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                role="listitem"
                className={classNames(
                  'flex min-w-0 flex-col gap-2',
                  'rounded-lg p-4',
                  'bg-bolt-elements-background-depth-2',
                  'border border-bolt-elements-borderColor',
                  style.bg,
                  'transition-all duration-200',
                )}
              >
                <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:justify-between sm:gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={classNames('shrink-0 text-lg', style.icon, style.color)} aria-hidden />
                    <div className="flex min-w-0 flex-col gap-1">
                      <h3 className="break-words text-sm font-medium text-bolt-elements-textPrimary">
                        {getNotificationsTabSafeMessage(
                          { level: log.level, category: log.category, message: log.message },
                          language,
                        )}
                      </h3>
                      {!isTechnicalError && log.details
                        ? renderNotificationDetails(log.details as NotificationDetails)
                        : null}
                      <p className="break-words text-xs text-bolt-elements-textTertiary">
                        {interpolateNotificationsTabCopy(copy['notificationsTab.category.label'], {
                          category: categoryValue,
                        })}
                      </p>
                    </div>
                  </div>
                  <time dateTime={log.timestamp} className="break-words text-xs text-bolt-elements-textTertiary">
                    {formatNotificationsTabRelativeTime(log.timestamp, language)}
                  </time>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default NotificationsTab;
