import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettings } from '~/lib/hooks/useSettings';
import { logStore } from '~/lib/stores/logs';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';
import { Dialog, DialogRoot, DialogTitle, DialogDescription, DialogButton } from '~/components/ui/Dialog';

interface GitHubCommitResponse {
  sha: string;
  commit: {
    message: string;
  };
}

interface GitHubReleaseResponse {
  tag_name: string;
  body: string;
  assets: Array<{
    size: number;
    browser_download_url: string;
  }>;
}

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  branch: string;
  hasUpdate: boolean;
  releaseNotes?: string;
  downloadSize?: string;
  changelog?: string[];
  currentCommit?: string;
  latestCommit?: string;
  downloadProgress?: number;
  installProgress?: number;
  estimatedTimeRemaining?: number;
}

interface UpdateSettings {
  autoUpdate: boolean;
  notifyInApp: boolean;
  checkInterval: number;
}

interface UpdateResponse {
  success: boolean;
  error?: string;
  progress?: {
    downloaded: number;
    total: number;
    stage: 'download' | 'install' | 'complete';
  };
}

const categorizeChangelog = (messages: string[]) => {
  const categories = new Map<string, string[]>();

  messages.forEach((message) => {
    let category = 'Other';

    if (message.startsWith('feat:')) {
      category = 'Features';
    } else if (message.startsWith('fix:')) {
      category = 'Bug Fixes';
    } else if (message.startsWith('docs:')) {
      category = 'Documentation';
    } else if (message.startsWith('ci:')) {
      category = 'CI Improvements';
    } else if (message.startsWith('refactor:')) {
      category = 'Refactoring';
    } else if (message.startsWith('test:')) {
      category = 'Testing';
    } else if (message.startsWith('style:')) {
      category = 'Styling';
    } else if (message.startsWith('perf:')) {
      category = 'Performance';
    }

    if (!categories.has(category)) {
      categories.set(category, []);
    }

    categories.get(category)!.push(message);
  });

  const order = [
    'Features',
    'Bug Fixes',
    'Documentation',
    'CI Improvements',
    'Refactoring',
    'Performance',
    'Testing',
    'Styling',
    'Other',
  ];

  return Array.from(categories.entries())
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .filter(([_, messages]) => messages.length > 0);
};

const parseCommitMessage = (message: string) => {
  const prMatch = message.match(/#(\d+)/);
  const prNumber = prMatch ? prMatch[1] : null;

  let cleanMessage = message.replace(/^[a-z]+:\s*/i, '');
  cleanMessage = cleanMessage.replace(/#\d+/g, '').trim();

  const parts = cleanMessage.split(/[\n\r]|\s+\*\s+/);
  const title = parts[0].trim();
  const description = parts
    .slice(1)
    .map((p) => p.trim())
    .filter((p) => p && !p.includes('Co-authored-by:'))
    .join('\n');

  return { title, description, prNumber };
};

const GITHUB_URLS = {
  commitJson: async (branch: string, headers: HeadersInit = {}): Promise<UpdateInfo> => {
    try {
      const [commitResponse, releaseResponse, changelogResponse] = await Promise.all([
        fetch(`https://api.github.com/repos/stackblitz-labs/bolt.diy/commits/${branch}`, { headers }),
        fetch('https://api.github.com/repos/stackblitz-labs/bolt.diy/releases/latest', { headers }),
        fetch(`https://api.github.com/repos/stackblitz-labs/bolt.diy/commits?sha=${branch}&per_page=10`, { headers }),
      ]);

      if (!commitResponse.ok || !releaseResponse.ok || !changelogResponse.ok) {
        throw new Error(
          `GitHub API error: ${!commitResponse.ok ? await commitResponse.text() : await releaseResponse.text()}`,
        );
      }

      const commitData = (await commitResponse.json()) as GitHubCommitResponse;
      const releaseData = (await releaseResponse.json()) as GitHubReleaseResponse;
      const commits = (await changelogResponse.json()) as GitHubCommitResponse[];

      const totalSize = releaseData.assets?.reduce((acc, asset) => acc + asset.size, 0) || 0;
      const downloadSize = (totalSize / (1024 * 1024)).toFixed(2) + ' MB';

      const changelog = commits.map((commit) => commit.commit.message);

      return {
        currentVersion: process.env.APP_VERSION || 'unknown',
        latestVersion: releaseData.tag_name || commitData.sha.substring(0, 7),
        branch,
        hasUpdate: commitData.sha !== process.env.CURRENT_COMMIT,
        releaseNotes: releaseData.body || '',
        downloadSize,
        changelog,
        currentCommit: process.env.CURRENT_COMMIT?.substring(0, 7),
        latestCommit: commitData.sha.substring(0, 7),
      };
    } catch (error) {
      console.error('Error fetching update info:', error);
      throw error;
    }
  },
};

const UpdateTab = () => {
  const { isLatestBranch } = useSettings();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [showChangelog, setShowChangelog] = useState(false);
  const [showManualInstructions, setShowManualInstructions] = useState(false);
  const [hasUserRespondedToUpdate, setHasUserRespondedToUpdate] = useState(false);
  const [updateFailed, setUpdateFailed] = useState(false);
  const [updateSettings, setUpdateSettings] = useState<UpdateSettings>(() => {
    const stored = localStorage.getItem('update_settings');
    return stored
      ? JSON.parse(stored)
      : {
          autoUpdate: false,
          notifyInApp: true,
          checkInterval: 24,
        };
  });
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [updateChangelog, setUpdateChangelog] = useState<string[]>([]);

  useEffect(() => {
    localStorage.setItem('update_settings', JSON.stringify(updateSettings));
  }, [updateSettings]);

  const handleUpdateProgress = async (response: Response): Promise<void> => {
    const reader = response.body?.getReader();

    if (!reader) {
      return;
    }

    const contentLength = +(response.headers.get('Content-Length') ?? 0);
    let receivedLength = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      receivedLength += value.length;

      const progress = (receivedLength / contentLength) * 100;

      setUpdateInfo((prev) => (prev ? { ...prev, downloadProgress: progress } : prev));
    }
  };

  const checkForUpdates = async () => {
    console.log('Starting update check...');
    setIsChecking(true);
    setError(null);
    setLastChecked(new Date());

    // Add a minimum delay of 2 seconds to show the spinning animation
    const startTime = Date.now();

    try {
      console.log('Fetching update info...');

      const githubToken = localStorage.getItem('github_connection');
      const headers: HeadersInit = {};

      if (githubToken) {
        const { token } = JSON.parse(githubToken);
        headers.Authorization = `Bearer ${token}`;
      }

      const branchToCheck = isLatestBranch ? 'main' : 'stable';
      const info = await GITHUB_URLS.commitJson(branchToCheck, headers);

      // Ensure we show the spinning animation for at least 2 seconds
      const elapsedTime = Date.now() - startTime;

      if (elapsedTime < 2000) {
        await new Promise((resolve) => setTimeout(resolve, 2000 - elapsedTime));
      }

      setUpdateInfo(info);

      if (info.hasUpdate) {
        const existingLogs = Object.values(logStore.logs.get());
        const hasUpdateNotification = existingLogs.some(
          (log) =>
            log.level === 'warning' &&
            log.details?.type === 'update' &&
            log.details.latestVersion === info.latestVersion,
        );

        if (!hasUpdateNotification && updateSettings.notifyInApp) {
          logStore.logWarning('Update Available', {
            currentVersion: info.currentVersion,
            latestVersion: info.latestVersion,
            branch: branchToCheck,
            type: 'update',
            message: `A new version is available on the ${branchToCheck} branch`,
            updateUrl: `https://github.com/stackblitz-labs/bolt.diy/compare/${info.currentVersion}...${info.latestVersion}`,
          });

          if (updateSettings.autoUpdate && !hasUserRespondedToUpdate) {
            setUpdateChangelog(info.changelog || ['No changelog available']);
            setShowUpdateDialog(true);
          }
        }
      }
    } catch (err) {
      console.error('Detailed update check error:', err);
      setError('Failed to check for updates. Please try again later.');
      console.error('Update check failed:', err);
      setUpdateFailed(true);
    } finally {
      console.log('Update check completed');
      setIsChecking(false);
    }
  };

  const initiateUpdate = async () => {
    setIsUpdating(true);
    setError(null);

    let currentRetry = 0;
    const maxRetries = 3;

    const attemptUpdate = async (): Promise<void> => {
      try {
        const platform = process.platform;

        if (platform === 'darwin' || platform === 'linux') {
          const response = await fetch('/api/update', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              branch: isLatestBranch ? 'main' : 'stable',
              settings: updateSettings,
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to initiate update');
          }

          await handleUpdateProgress(response);

          const result = (await response.json()) as UpdateResponse;

          if (result.success) {
            logStore.logSuccess('Update downloaded successfully', {
              type: 'update',
              message: 'Update completed successfully.',
            });
            toast.success('Update completed successfully!');
            setUpdateFailed(false);

            return;
          }

          throw new Error(result.error || 'Update failed');
        }

        window.open('https://github.com/stackblitz-labs/bolt.diy/releases/latest', '_blank');
        logStore.logInfo('Manual update required', {
          type: 'update',
          message: 'Please download and install the latest version from the GitHub releases page.',
        });

        return;
      } catch (err) {
        currentRetry++;

        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';

        if (currentRetry < maxRetries) {
          toast.warning(`Update attempt ${currentRetry} failed. Retrying...`, { autoClose: 2000 });
          setRetryCount(currentRetry);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          await attemptUpdate();

          return;
        }

        setError('Failed to initiate update. Please try again or update manually.');
        console.error('Update failed:', err);
        logStore.logSystem('Update failed: ' + errorMessage);
        toast.error('Update failed: ' + errorMessage);
        setUpdateFailed(true);

        return;
      }
    };

    await attemptUpdate();
    setIsUpdating(false);
    setRetryCount(0);
  };

  useEffect(() => {
    const checkInterval = updateSettings.checkInterval * 60 * 60 * 1000;
    const intervalId = setInterval(checkForUpdates, checkInterval);

    return () => clearInterval(intervalId);
  }, [updateSettings.checkInterval, isLatestBranch]);

  useEffect(() => {
    checkForUpdates();
  }, [isLatestBranch]);

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

      {/* Update Settings Card */}
      <motion.div
        className="p-6 rounded-xl bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="i-ph:gear text-purple-500 w-5 h-5" />
          <h3 className="text-lg font-medium text-bolt-elements-textPrimary">Update Settings</h3>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-bolt-elements-textPrimary">Automatic Updates</span>
              <p className="text-xs text-bolt-elements-textSecondary">
                Automatically check and apply updates when available
              </p>
            </div>
            <button
              onClick={() => setUpdateSettings((prev) => ({ ...prev, autoUpdate: !prev.autoUpdate }))}
              className={classNames(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                updateSettings.autoUpdate ? 'bg-purple-500' : 'bg-gray-200 dark:bg-gray-700',
              )}
            >
              <span
                className={classNames(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                  updateSettings.autoUpdate ? 'translate-x-6' : 'translate-x-1',
                )}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-bolt-elements-textPrimary">In-App Notifications</span>
              <p className="text-xs text-bolt-elements-textSecondary">Show notifications when updates are available</p>
            </div>
            <button
              onClick={() => setUpdateSettings((prev) => ({ ...prev, notifyInApp: !prev.notifyInApp }))}
              className={classNames(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                updateSettings.notifyInApp ? 'bg-purple-500' : 'bg-gray-200 dark:bg-gray-700',
              )}
            >
              <span
                className={classNames(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                  updateSettings.notifyInApp ? 'translate-x-6' : 'translate-x-1',
                )}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-bolt-elements-textPrimary">Check Interval</span>
              <p className="text-xs text-bolt-elements-textSecondary">How often to check for updates</p>
            </div>
            <select
              value={updateSettings.checkInterval}
              onChange={(e) => setUpdateSettings((prev) => ({ ...prev, checkInterval: Number(e.target.value) }))}
              className={classNames(
                'px-3 py-2 rounded-lg text-sm',
                'bg-[#F5F5F5] dark:bg-[#1A1A1A]',
                'border border-[#E5E5E5] dark:border-[#1A1A1A]',
                'text-bolt-elements-textPrimary',
                'hover:bg-[#E5E5E5] dark:hover:bg-[#2A2A2A]',
                'transition-colors duration-200',
              )}
            >
              <option value="6">6 hours</option>
              <option value="12">12 hours</option>
              <option value="24">24 hours</option>
              <option value="48">48 hours</option>
            </select>
          </div>
        </div>
      </motion.div>

      {/* Update Status Card */}
      <motion.div
        className="p-6 rounded-xl bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <span className="text-sm text-bolt-elements-textSecondary">
              Currently on {isLatestBranch ? 'main' : 'stable'} branch
            </span>
            {updateInfo && (
              <span className="text-xs text-bolt-elements-textTertiary">
                Version: {updateInfo.currentVersion} ({updateInfo.currentCommit})
              </span>
            )}
          </div>
          <button
            onClick={() => {
              setHasUserRespondedToUpdate(false);
              setUpdateFailed(false);
              setError(null);
              checkForUpdates();
            }}
            disabled={isChecking}
            className={classNames(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
              'bg-[#F5F5F5] dark:bg-[#1A1A1A]',
              'hover:bg-purple-500/10 hover:text-purple-500',
              'dark:hover:bg-purple-500/20 dark:hover:text-purple-500',
              'text-bolt-elements-textPrimary',
              'transition-colors duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <div className={classNames('i-ph:arrows-clockwise w-4 h-4', isChecking ? 'animate-spin' : '')} />
            {isChecking ? 'Checking...' : 'Check for Updates'}
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400">
            <div className="flex items-center gap-2">
              <div className="i-ph:warning-circle" />
              {error}
            </div>
          </div>
        )}

        {updateInfo && (
          <div
            className={classNames(
              'p-4 rounded-lg',
              updateInfo.hasUpdate
                ? 'bg-purple-500/5 dark:bg-purple-500/10 border border-purple-500/20'
                : 'bg-green-500/5 dark:bg-green-500/10 border border-green-500/20',
            )}
          >
            <div className="flex items-center gap-3">
              <span
                className={classNames(
                  'text-lg',
                  updateInfo.hasUpdate ? 'i-ph:warning text-purple-500' : 'i-ph:check-circle text-green-500',
                )}
              />
              <div>
                <h4 className="font-medium text-bolt-elements-textPrimary">
                  {updateInfo.hasUpdate ? 'Update Available' : 'Up to Date'}
                </h4>
                <p className="text-sm text-bolt-elements-textSecondary">
                  {updateInfo.hasUpdate
                    ? `Version ${updateInfo.latestVersion} (${updateInfo.latestCommit}) is now available`
                    : 'You are running the latest version'}
                </p>
              </div>
            </div>
          </div>
        )}
        {lastChecked && (
          <div className="flex flex-col items-end mt-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Last checked: {lastChecked.toLocaleString()}
            </span>
            {error && <span className="text-xs text-red-500 mt-1">{error}</span>}
          </div>
        )}
      </motion.div>

      {/* Update Details Card */}
      {updateInfo && updateInfo.hasUpdate && (
        <motion.div
          className="p-6 rounded-xl bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="i-ph:arrow-circle-up text-purple-500 w-5 h-5" />
              <span className="text-sm font-medium text-bolt-elements-textPrimary">
                Version {updateInfo.latestVersion}
              </span>
            </div>
            <span className="text-xs px-3 py-1 rounded-full bg-purple-500/10 text-purple-500">
              {updateInfo.downloadSize}
            </span>
          </div>

          {/* Update Options */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={initiateUpdate}
                disabled={isUpdating || updateFailed}
                className={classNames(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm',
                  'bg-[#F5F5F5] dark:bg-[#1A1A1A]',
                  'hover:bg-purple-500/10 hover:text-purple-500',
                  'dark:hover:bg-purple-500/20 dark:hover:text-purple-500',
                  'text-bolt-elements-textPrimary',
                  'transition-all duration-200',
                )}
              >
                <div className={classNames('i-ph:arrow-circle-up w-4 h-4', isUpdating ? 'animate-spin' : '')} />
                {isUpdating ? 'Updating...' : 'Auto Update'}
              </button>
              <button
                onClick={() => setShowManualInstructions(!showManualInstructions)}
                className={classNames(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm',
                  'bg-[#F5F5F5] dark:bg-[#1A1A1A]',
                  'hover:bg-purple-500/10 hover:text-purple-500',
                  'dark:hover:bg-purple-500/20 dark:hover:text-purple-500',
                  'text-bolt-elements-textPrimary',
                  'transition-all duration-200',
                )}
              >
                <div className="i-ph:book-open w-4 h-4" />
                {showManualInstructions ? 'Hide Instructions' : 'Manual Update'}
              </button>
            </div>

            {/* Manual Update Instructions */}
            <AnimatePresence>
              {showManualInstructions && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-6 text-bolt-elements-textSecondary"
                >
                  <div className="p-4 rounded-lg bg-purple-500/5 dark:bg-purple-500/10 border border-purple-500/20">
                    <p className="font-medium text-purple-500">
                      Update available from {isLatestBranch ? 'main' : 'stable'} branch!
                    </p>
                    <div className="mt-2 space-y-1">
                      <p>
                        Current: {updateInfo.currentVersion} ({updateInfo.currentCommit})
                      </p>
                      <p>
                        Latest: {updateInfo.latestVersion} ({updateInfo.latestCommit})
                      </p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-base font-medium text-bolt-elements-textPrimary mb-3">To update:</h4>
                    <ol className="space-y-4">
                      <li className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center">
                          1
                        </div>
                        <div>
                          <p className="font-medium text-bolt-elements-textPrimary">Pull the latest changes:</p>
                          <code className="mt-2 block p-3 rounded-lg bg-[#F5F5F5] dark:bg-[#1A1A1A] font-mono text-sm">
                            git pull upstream {isLatestBranch ? 'main' : 'stable'}
                          </code>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center">
                          2
                        </div>
                        <div>
                          <p className="font-medium text-bolt-elements-textPrimary">Install dependencies:</p>
                          <code className="mt-2 block p-3 rounded-lg bg-[#F5F5F5] dark:bg-[#1A1A1A] font-mono text-sm">
                            pnpm install
                          </code>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center">
                          3
                        </div>
                        <div>
                          <p className="font-medium text-bolt-elements-textPrimary">Build the application:</p>
                          <code className="mt-2 block p-3 rounded-lg bg-[#F5F5F5] dark:bg-[#1A1A1A] font-mono text-sm">
                            pnpm build
                          </code>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center">
                          4
                        </div>
                        <p className="font-medium text-bolt-elements-textPrimary">Restart the application</p>
                      </li>
                    </ol>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Changelog */}
            {updateInfo.changelog && updateInfo.changelog.length > 0 && (
              <div className="mt-4">
                <button
                  onClick={() => setShowChangelog(!showChangelog)}
                  className={classNames(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm',
                    'bg-[#F5F5F5] dark:bg-[#1A1A1A]',
                    'hover:bg-purple-500/10 hover:text-purple-500',
                    'dark:hover:bg-purple-500/20 dark:hover:text-purple-500',
                    'text-bolt-elements-textSecondary',
                    'transition-colors duration-200',
                  )}
                >
                  <div className={`i-ph:${showChangelog ? 'caret-up' : 'caret-down'} w-4 h-4`} />
                  {showChangelog ? 'Hide Changelog' : 'View Changelog'}
                </button>

                <AnimatePresence>
                  {showChangelog && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 rounded-lg bg-[#F5F5F5] dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#1A1A1A]"
                    >
                      <div className="max-h-[400px] overflow-y-auto">
                        {categorizeChangelog(updateInfo.changelog).map(([category, messages]) => (
                          <div key={category} className="border-b last:border-b-0 border-bolt-elements-borderColor">
                            <div className="p-3 bg-[#EAEAEA] dark:bg-[#2A2A2A]">
                              <h5 className="text-sm font-medium text-bolt-elements-textPrimary">
                                {category}
                                <span className="ml-2 text-xs text-bolt-elements-textSecondary">
                                  ({messages.length})
                                </span>
                              </h5>
                            </div>
                            <div className="divide-y divide-bolt-elements-borderColor">
                              {messages.map((message, index) => {
                                const { title, description, prNumber } = parseCommitMessage(message);
                                return (
                                  <div key={index} className="p-3 hover:bg-bolt-elements-bg-depth-4 transition-colors">
                                    <div className="flex items-start gap-3">
                                      <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-bolt-elements-textSecondary" />
                                      <div className="space-y-1 flex-1">
                                        <p className="text-sm font-medium text-bolt-elements-textPrimary">
                                          {title}
                                          {prNumber && (
                                            <span className="ml-2 text-xs text-bolt-elements-textSecondary">
                                              #{prNumber}
                                            </span>
                                          )}
                                        </p>
                                        {description && (
                                          <p className="text-xs text-bolt-elements-textSecondary">{description}</p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Update Progress */}
      {isUpdating && updateInfo?.downloadProgress !== undefined && (
        <motion.div
          className="p-6 rounded-xl bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1A1A1A]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-bolt-elements-textPrimary">Downloading Update</span>
              <span className="text-sm text-bolt-elements-textSecondary">
                {Math.round(updateInfo.downloadProgress)}%
              </span>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all duration-300"
                style={{ width: `${updateInfo.downloadProgress}%` }}
              />
            </div>
            {retryCount > 0 && <p className="text-sm text-yellow-500">Retry attempt {retryCount}/3...</p>}
          </div>
        </motion.div>
      )}

      {/* Update Confirmation Dialog */}
      <DialogRoot open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
        <Dialog
          onClose={() => {
            setShowUpdateDialog(false);
            setHasUserRespondedToUpdate(true);
            logStore.logSystem('Update cancelled by user');
          }}
        >
          <div className="p-6 w-[500px]">
            <DialogTitle>Update Available</DialogTitle>
            <DialogDescription className="mt-2">
              A new version is available. Would you like to update now?
            </DialogDescription>

            <div className="mt-3">
              <h3 className="text-sm font-medium text-bolt-elements-textPrimary mb-2">Changelog:</h3>
              <div
                className="bg-[#F5F5F5] dark:bg-[#1A1A1A] rounded-lg p-3 max-h-[300px] overflow-y-auto"
                style={{
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(155, 155, 155, 0.5) transparent',
                }}
              >
                <div className="text-sm text-bolt-elements-textSecondary space-y-1.5">
                  {updateChangelog.map((log, index) => (
                    <div key={index} className="break-words leading-relaxed">
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-3">
              <DialogButton
                type="secondary"
                onClick={() => {
                  setShowUpdateDialog(false);
                  setHasUserRespondedToUpdate(true);
                  logStore.logSystem('Update cancelled by user');
                }}
              >
                Cancel
              </DialogButton>
              <DialogButton
                type="primary"
                onClick={async () => {
                  setShowUpdateDialog(false);
                  setHasUserRespondedToUpdate(true);
                  await initiateUpdate();
                }}
              >
                Update Now
              </DialogButton>
            </div>
          </div>
        </Dialog>
      </DialogRoot>
    </div>
  );
};

export default UpdateTab;
