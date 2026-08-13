import { useEffect, useState } from 'react';
import { getDebugStatus, type DebugStatus } from '~/lib/api/debug';

export default function DebugTab() {
  const [status, setStatus] = useState<DebugStatus>({ warnings: [], errors: [] });

  useEffect(() => {
    let cancelled = false;

    getDebugStatus()
      .then((next) => {
        if (!cancelled) {
          setStatus(next);
        }
      })
      .catch((error) => {
        console.error('Failed to load debug status:', error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const issues = [...status.errors, ...status.warnings];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
        <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Runtime Diagnostics</h3>
        <p className="text-sm text-bolt-elements-textSecondary">
          {issues.length === 0 ? 'No active diagnostics issues detected' : `${issues.length} issue(s) detected`}
        </p>
      </div>
      <div className="space-y-3">
        {issues.map((issue) => (
          <div key={issue.id} className="rounded-lg bg-bolt-elements-background-depth-2 p-4">
            <div className="text-sm font-medium text-bolt-elements-textPrimary">{issue.message}</div>
            <div className="text-xs text-bolt-elements-textSecondary">{issue.timestamp}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
