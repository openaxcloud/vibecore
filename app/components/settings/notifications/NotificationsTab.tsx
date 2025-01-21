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
  const [filter, setFilter] = useState<'all' | 'error' | 'warning' | 'update'>('all');
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
        return log.level === 'error' || log.level === 'warning' || log.details?.type === 'update';
      }

      if (filter === 'update') {
        return log.details?.type === 'update';
      }

      return log.level === filter;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const getNotificationStyle = (log: (typeof filteredLogs)[0]) => {
    if (log.details?.type === 'update') {
      return {
        border: 'border-purple-200 dark:border-purple-900/50',
        bg: 'bg-purple-50 dark:bg-purple-900/20',
        icon: 'i-ph:arrow-circle-up text-purple-600 dark:text-purple-400',
        text: 'text-purple-900 dark:text-purple-300',
      };
    }

    if (log.level === 'error') {
      return {
        border: 'border-red-200 dark:border-red-900/50',
        bg: 'bg-red-50 dark:bg-red-900/20',
        icon: 'i-ph:warning-circle text-red-600 dark:text-red-400',
        text: 'text-red-900 dark:text-red-300',
      };
    }

    return {
      border: 'border-yellow-200 dark:border-yellow-900/50',
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      icon: 'i-ph:warning text-yellow-600 dark:text-yellow-400',
      text: 'text-yellow-900 dark:text-yellow-300',
    };
  };

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
            className="mt-2 inline-flex items-center gap-2 rounded-md bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-600 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:hover:bg-purple-900/30"
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
            onChange={(e) => setFilter(e.target.value as 'all' | 'error' | 'warning' | 'update')}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <option value="all">All Notifications</option>
            <option value="update">Updates</option>
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
          filteredLogs.map((log) => {
            const style = getNotificationStyle(log);
            return (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={classNames('flex flex-col gap-2 rounded-lg border p-4', style.border, style.bg)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className={classNames('text-lg', style.icon)} />
                    <div>
                      <h3 className={classNames('text-sm font-medium', style.text)}>{log.message}</h3>
                      {log.details && renderNotificationDetails(log.details as NotificationDetails)}
                    </div>
                  </div>
                  <time className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                    {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
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
