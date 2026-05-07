import { useState } from 'react';
import { toast } from 'react-toastify';

interface UpdateProgress {
  stage: string;
  message: string;
  progress: number;
  error?: string;
  details?: {
    changedFiles?: string[];
    additions?: number;
    deletions?: number;
    commitMessages?: string[];
    currentCommit?: string;
    remoteCommit?: string;
    updateReady?: boolean;
    compareUrl?: string;
    changelog?: string;
  };
}

export default function UpdateTab() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateProgress | null>(null);

  const checkUpdates = async () => {
    setChecking(true);
    setResult(null);

    try {
      const response = await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: 'main', autoUpdate: false }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Update check failed: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = '';
      let lastProgress: UpdateProgress | null = null;

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          lastProgress = JSON.parse(line);
          setResult(lastProgress);
        }
      }

      if (lastProgress?.error) {
        toast.error(lastProgress.error);
      } else {
        toast.success(lastProgress?.message || 'Update check complete');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Update check failed';
      setResult({ stage: 'complete', message, progress: 100, error: message });
      toast.error(message);
    } finally {
      setChecking(false);
    }
  };

  const details = result?.details;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Update Status</h3>
            <p className="text-sm text-bolt-elements-textSecondary">{result?.message || 'Check upstream/main'}</p>
          </div>
          <button
            type="button"
            onClick={checkUpdates}
            disabled={checking}
            className="rounded-lg bg-purple-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {checking ? 'Checking...' : 'Check updates'}
          </button>
        </div>
      </div>

      {details && (
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-bolt-elements-background-depth-1 p-3">
              <div className="text-bolt-elements-textSecondary">Current</div>
              <div className="font-medium text-bolt-elements-textPrimary">{details.currentCommit}</div>
            </div>
            <div className="rounded-lg bg-bolt-elements-background-depth-1 p-3">
              <div className="text-bolt-elements-textSecondary">Upstream</div>
              <div className="font-medium text-bolt-elements-textPrimary">{details.remoteCommit}</div>
            </div>
            <div className="rounded-lg bg-bolt-elements-background-depth-1 p-3">
              <div className="text-bolt-elements-textSecondary">Diff</div>
              <div className="font-medium text-bolt-elements-textPrimary">
                +{details.additions || 0} / -{details.deletions || 0}
              </div>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-lg bg-bolt-elements-background-depth-1 p-3">
            {(details.changedFiles || []).map((file) => (
              <div key={file} className="text-xs text-bolt-elements-textSecondary">
                {file}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
