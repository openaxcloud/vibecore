import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { logStore } from '~/lib/stores/logs';
import { useStore } from '@nanostores/react';
import { formatDistanceToNow } from 'date-fns';
import { classNames } from '~/utils/classNames';

interface NotificationDetails {
  type?: string;
  message?: string;
  currentVersion?: string;
  latestVersion?: string;
  branch?: string;
  updateUrl?: string;
}

const NotificationsTab = () => {
  const [filter, setFilter] = useState<'all' | 'error' | 'warning'>('all');
  const logs = useStore(logStore.logs);

  const handleClearNotifications = () => {
    logStore.clearLogs();
  };

  const handleUpdateAction = (updateUrl: string) => {
    window.open(updateUrl, '_blank');
  };

  const filteredLogs = Object.values(logs)
    .filter((log) => {
      if (filter === 'all') {
        return log.level === 'error' || log.level === 'warning';
      }

      return log.level === filter;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const renderNotificationDetails = (details: NotificationDetails) => {
    if (details.type === 'update') {
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-gray-600 dark:text-gray-400">{details.message}</p>
          <div className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-500">
            <p>Current Version: {details.currentVersion}</p>
            <p>Latest Version: {details.latestVersion}</p>
            <p>Branch: {details.branch}</p>
          </div>
          <button
            onClick={() => details.updateUrl && handleUpdateAction(details.updateUrl)}
            className="mt-2 inline-flex items-center gap-2 rounded-md bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
          >
            <span className="i-ph:git-branch text-lg" />
            View Changes
          </button>
        </div>
      );
    }

    return details.message ? <p className="text-sm text-gray-600 dark:text-gray-400">{details.message}</p> : null;
  };

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as 'all' | 'error' | 'warning')}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <option value="all">All Notifications</option>
            <option value="error">Errors</option>
            <option value="warning">Warnings</option>
          </select>
        </div>
        <button
          onClick={handleClearNotifications}
          className="rounded-md bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          Clear All
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-gray-200 p-8 text-center dark:border-gray-700">
            <span className="i-ph:bell-slash text-4xl text-gray-400 dark:text-gray-600" />
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">No Notifications</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">You're all caught up!</p>
            </div>
          </div>
        ) : (
          filteredLogs.map((log) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={classNames(
                'flex flex-col gap-2 rounded-lg border p-4',
                log.level === 'error'
                  ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20'
                  : 'border-yellow-200 bg-yellow-50 dark:border-yellow-900/50 dark:bg-yellow-900/20',
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span
                    className={classNames(
                      'text-lg',
                      log.level === 'error'
                        ? 'i-ph:warning-circle text-red-600 dark:text-red-400'
                        : 'i-ph:warning text-yellow-600 dark:text-yellow-400',
                    )}
                  />
                  <div>
                    <h3
                      className={classNames(
                        'text-sm font-medium',
                        log.level === 'error'
                          ? 'text-red-900 dark:text-red-300'
                          : 'text-yellow-900 dark:text-yellow-300',
                      )}
                    >
                      {log.message}
                    </h3>
                    {log.details && renderNotificationDetails(log.details as NotificationDetails)}
                  </div>
                </div>
                <time className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                  {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                </time>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};

export default NotificationsTab;
