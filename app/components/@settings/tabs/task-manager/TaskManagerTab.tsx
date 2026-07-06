import { useMemo, useState } from 'react';
import { toast } from 'react-toastify';

const formatBytes = (bytes: number) => {
  if (!bytes) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);

  return `${(bytes / 1024 ** index).toFixed(1)} ${units[index]}`;
};

export default function TaskManagerTab() {
  const [refreshKey, setRefreshKey] = useState(0);

  const items = useMemo(() => {
    return Object.keys(localStorage)
      .sort()
      .map((key) => {
        const value = localStorage.getItem(key) || '';
        return { key, size: new Blob([value]).size };
      });
  }, [refreshKey]);

  const clearVolatileData = () => {
    ['error_logs', 'bolt_acknowledged_connection_issue'].forEach((key) => localStorage.removeItem(key));
    setRefreshKey((value) => value + 1);
    toast.success('Temporary data cleared');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
        <div>
          <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Browser storage</h3>
          <p className="text-sm text-bolt-elements-textSecondary">{items.length} local storage entries</p>
        </div>
        <button
          type="button"
          onClick={clearVolatileData}
          className="rounded-lg bg-[var(--vc-ide-accent-action)] px-3 py-2 text-sm text-white"
        >
          Clear temporary
        </button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-bolt-elements-borderColor">
        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between border-b border-bolt-elements-borderColor px-4 py-2 last:border-b-0"
          >
            <span className="text-sm text-bolt-elements-textPrimary">{item.key}</span>
            <span className="text-xs text-bolt-elements-textSecondary">{formatBytes(item.size)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
