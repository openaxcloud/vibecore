import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSettings } from '~/lib/hooks/useSettings';
import { logStore } from '~/lib/stores/logs';
import { classNames } from '~/utils/classNames';

interface GitHubCommitResponse {
  sha: string;
}

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  branch: string;
  hasUpdate: boolean;
}

const GITHUB_URLS = {
  commitJson: async (branch: string): Promise<UpdateInfo> => {
    try {
      const response = await fetch(`https://api.github.com/repos/stackblitz-labs/bolt.diy/commits/${branch}`);
      const data = (await response.json()) as GitHubCommitResponse;

      const currentCommitHash = __COMMIT_HASH;
      const remoteCommitHash = data.sha.slice(0, 7);

      return {
        currentVersion: currentCommitHash,
        latestVersion: remoteCommitHash,
        branch,
        hasUpdate: remoteCommitHash !== currentCommitHash,
      };
    } catch (error) {
      console.error('Failed to fetch commit info:', error);
      throw new Error('Failed to fetch commit info');
    }
  },
};

const UpdateTab = () => {
  const { isLatestBranch } = useSettings();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkForUpdates = async () => {
    setIsChecking(true);
    setError(null);

    try {
      const branchToCheck = isLatestBranch ? 'main' : 'stable';
      const info = await GITHUB_URLS.commitJson(branchToCheck);
      setUpdateInfo(info);

      if (info.hasUpdate) {
        // Add update notification only if it doesn't already exist
        const existingLogs = Object.values(logStore.logs.get());
        const hasUpdateNotification = existingLogs.some(
          (log) =>
            log.level === 'warning' &&
            log.details?.type === 'update' &&
            log.details.latestVersion === info.latestVersion,
        );

        if (!hasUpdateNotification) {
          logStore.logWarning('Update Available', {
            currentVersion: info.currentVersion,
            latestVersion: info.latestVersion,
            branch: branchToCheck,
            type: 'update',
            message: `A new version is available on the ${branchToCheck} branch`,
            updateUrl: `https://github.com/stackblitz-labs/bolt.diy/compare/${info.currentVersion}...${info.latestVersion}`,
          });
        }
      }
    } catch (err) {
      setError('Failed to check for updates. Please try again later.');
      console.error('Update check failed:', err);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkForUpdates();
  }, [isLatestBranch]);

  const handleViewChanges = () => {
    if (updateInfo) {
      window.open(
        `https://github.com/stackblitz-labs/bolt.diy/compare/${updateInfo.currentVersion}...${updateInfo.latestVersion}`,
        '_blank',
      );
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <motion.div
        className="flex items-center gap-3"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="i-ph:arrow-circle-up text-xl text-purple-500" />
        <div>
          <h3 className="text-lg font-medium text-bolt-elements-textPrimary">Updates</h3>
          <p className="text-sm text-bolt-elements-textSecondary">Check for and manage application updates</p>
        </div>
      </motion.div>

      <motion.div
        className="flex flex-col gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm text-bolt-elements-textSecondary">
              Currently on {isLatestBranch ? 'main' : 'stable'} branch
            </span>
            {updateInfo && (
              <span className="text-xs text-bolt-elements-textTertiary">Version: {updateInfo.currentVersion}</span>
            )}
          </div>
          <button
            onClick={checkForUpdates}
            disabled={isChecking}
            className={classNames(
              'px-3 py-2 rounded-lg text-sm',
              'bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
              'text-bolt-elements-textPrimary',
              'hover:bg-bolt-elements-background-depth-3',
              'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
              'transition-all duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <div className="flex items-center gap-2">
              <div className={classNames('i-ph:arrows-clockwise', isChecking ? 'animate-spin' : '')} />
              {isChecking ? 'Checking...' : 'Check for Updates'}
            </div>
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-900/50 dark:text-red-400">
            <div className="flex items-center gap-2">
              <div className="i-ph:warning-circle" />
              {error}
            </div>
          </div>
        )}

        {updateInfo && (
          <div
            className={classNames(
              'p-4 rounded-lg border',
              updateInfo.hasUpdate
                ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-900/50'
                : 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-900/50',
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span
                  className={classNames(
                    'text-lg',
                    updateInfo.hasUpdate
                      ? 'i-ph:warning text-yellow-600 dark:text-yellow-400'
                      : 'i-ph:check-circle text-green-600 dark:text-green-400',
                  )}
                />
                <div>
                  <h3
                    className={classNames(
                      'text-sm font-medium',
                      updateInfo.hasUpdate
                        ? 'text-yellow-900 dark:text-yellow-300'
                        : 'text-green-900 dark:text-green-300',
                    )}
                  >
                    {updateInfo.hasUpdate ? 'Update Available' : 'Up to Date'}
                  </h3>
                  <p className="text-sm text-bolt-elements-textSecondary mt-1">
                    {updateInfo.hasUpdate
                      ? `A new version is available on the ${updateInfo.branch} branch`
                      : 'You are running the latest version'}
                  </p>
                  {updateInfo.hasUpdate && (
                    <div className="mt-2 flex flex-col gap-1 text-xs text-bolt-elements-textTertiary">
                      <p>Current Version: {updateInfo.currentVersion}</p>
                      <p>Latest Version: {updateInfo.latestVersion}</p>
                      <p>Branch: {updateInfo.branch}</p>
                    </div>
                  )}
                </div>
              </div>
              {updateInfo.hasUpdate && (
                <button
                  onClick={handleViewChanges}
                  className="shrink-0 inline-flex items-center gap-2 rounded-md bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
                >
                  <span className="i-ph:git-branch text-lg" />
                  View Changes
                </button>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default UpdateTab;
