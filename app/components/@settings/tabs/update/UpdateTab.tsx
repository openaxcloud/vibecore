import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSettings } from '~/lib/hooks/useSettings';
import { logStore } from '~/lib/stores/logs';
import { toast } from 'react-toastify';
import { Dialog, DialogRoot, DialogTitle, DialogDescription, DialogButton } from '~/components/ui/Dialog';

interface UpdateProgress {
  stage: 'fetch' | 'pull' | 'install' | 'build' | 'complete';
  message: string;
  progress?: number;
  error?: string;
  details?: {
    changedFiles?: string[];
    additions?: number;
    deletions?: number;
    commitMessages?: string[];
    totalSize?: string;
    currentCommit?: string;
    remoteCommit?: string;
  };
}

interface UpdateSettings {
  autoUpdate: boolean;
  notifyInApp: boolean;
  checkInterval: number;
}

const ProgressBar = ({ progress }: { progress: number }) => (
  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
    <motion.div
      className="h-full bg-blue-500"
      initial={{ width: 0 }}
      animate={{ width: `${progress}%` }}
      transition={{ duration: 0.3 }}
    />
  </div>
);

const UpdateProgressDisplay = ({ progress }: { progress: UpdateProgress }) => (
  <div className="mt-4 space-y-2">
    <div className="flex justify-between items-center">
      <span className="text-sm font-medium">{progress.message}</span>
      <span className="text-sm text-gray-500">{progress.progress}%</span>
    </div>
    <ProgressBar progress={progress.progress || 0} />
    {progress.details && (
      <div className="mt-2 text-sm text-gray-600">
        {progress.details.changedFiles && progress.details.changedFiles.length > 0 && (
          <div className="mt-2">
            <div className="font-medium">Changed Files:</div>
            <ul className="list-disc list-inside">
              {progress.details.changedFiles.map((file, index) => (
                <li key={index} className="ml-2">
                  {file}
                </li>
              ))}
            </ul>
          </div>
        )}
        {progress.details.totalSize && <div className="mt-1">Total size: {progress.details.totalSize}</div>}
        {progress.details.additions !== undefined && progress.details.deletions !== undefined && (
          <div className="mt-1">
            Changes: <span className="text-green-600">+{progress.details.additions}</span>{' '}
            <span className="text-red-600">-{progress.details.deletions}</span>
          </div>
        )}
        {progress.details.currentCommit && progress.details.remoteCommit && (
          <div className="mt-1">
            Updating from {progress.details.currentCommit} to {progress.details.remoteCommit}
          </div>
        )}
      </div>
    )}
  </div>
);

const UpdateTab = () => {
  const { isLatestBranch } = useSettings();
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updateSettings] = useState<UpdateSettings>(() => {
    const stored = localStorage.getItem('update_settings');
    return stored
      ? JSON.parse(stored)
      : {
          autoUpdate: false,
          notifyInApp: true,
          checkInterval: 24,
        };
  });
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);

  useEffect(() => {
    localStorage.setItem('update_settings', JSON.stringify(updateSettings));
  }, [updateSettings]);

  const checkForUpdates = async () => {
    console.log('Starting update check...');
    setIsChecking(true);
    setError(null);
    setUpdateProgress(null);

    try {
      const branchToCheck = isLatestBranch ? 'main' : 'stable';

      // Start the update check with streaming progress
      const response = await fetch('/api/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ branch: branchToCheck }),
      });

      if (!response.ok) {
        throw new Error(`Update check failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();

      if (!reader) {
        throw new Error('No response stream available');
      }

      // Read the stream
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        // Convert the chunk to text and parse the JSON
        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const progress = JSON.parse(line) as UpdateProgress;
            setUpdateProgress(progress);

            if (progress.error) {
              setError(progress.error);
            }

            // If we're done, update the UI accordingly
            if (progress.stage === 'complete') {
              setIsChecking(false);

              if (!progress.error) {
                // Update was successful
                toast.success('Update check completed');

                if (progress.details?.changedFiles?.length) {
                  setShowUpdateDialog(true);
                }
              }
            }
          } catch (e) {
            console.error('Error parsing progress update:', e);
          }
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
      logStore.logWarning('Update Check Failed', {
        type: 'update',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Updates</h2>
        <button
          onClick={() => {
            setError(null);
            checkForUpdates();
          }}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50"
          disabled={isChecking}
        >
          {isChecking ? (
            <div className="flex items-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"
              />
              Checking...
            </div>
          ) : (
            'Check for Updates'
          )}
        </button>
      </div>

      {/* Show progress information */}
      {updateProgress && <UpdateProgressDisplay progress={updateProgress} />}

      {error && <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">{error}</div>}

      {/* Update dialog */}
      <DialogRoot open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
        <Dialog>
          <DialogTitle>Update Available</DialogTitle>
          <DialogDescription>
            {updateProgress?.details?.changedFiles && (
              <div className="mt-4">
                <p className="font-medium">Changes:</p>
                <ul className="list-disc list-inside mt-2">
                  {updateProgress.details.changedFiles.map((file, index) => (
                    <li key={index} className="text-sm">
                      {file}
                    </li>
                  ))}
                </ul>
                {updateProgress.details.totalSize && (
                  <p className="mt-2 text-sm">Total size: {updateProgress.details.totalSize}</p>
                )}
              </div>
            )}
          </DialogDescription>
          <div className="flex justify-end gap-2 mt-4">
            <DialogButton type="secondary" onClick={() => setShowUpdateDialog(false)}>
              Cancel
            </DialogButton>
            <DialogButton
              type="primary"
              onClick={() => {
                setShowUpdateDialog(false);

                // Handle update initiation here
              }}
            >
              Update Now
            </DialogButton>
          </div>
        </Dialog>
      </DialogRoot>
    </div>
  );
};

export default UpdateTab;
