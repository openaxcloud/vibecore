import { toast } from 'react-toastify';

export const AGENT_APPLIED_TOAST_ID = 'agent-auto-applied-files';

export function AppliedFilesToast({
  files,
  onDismissAll,
  onUndoAll,
}: {
  files: string[];
  onDismissAll: () => void;
  onUndoAll: () => void;
}) {
  const visibleFiles = files.slice(0, 8);
  const remainingCount = Math.max(files.length - visibleFiles.length, 0);

  return (
    <div className="bolt-agent-applied-toast">
      <div className="bolt-agent-applied-toast-head">
        <strong>
          {files.length} file{files.length === 1 ? '' : 's'} applied
        </strong>
        <span>Successful agent patches were written.</span>
      </div>
      <details>
        <summary>View details</summary>
        <ul>
          {visibleFiles.map((file) => (
            <li key={file} title={file}>
              {file}
            </li>
          ))}
          {remainingCount > 0 ? (
            <li>
              {remainingCount} more file{remainingCount === 1 ? '' : 's'}
            </li>
          ) : null}
        </ul>
      </details>
      <div className="bolt-agent-applied-toast-actions">
        <button type="button" onClick={onUndoAll}>
          Undo all
        </button>
        <button type="button" onClick={onDismissAll}>
          Dismiss all
        </button>
      </div>
    </div>
  );
}

export function showCoalescedAppliedToast(
  files: string[],
  callbacks: { onUndoAll: () => void; onDismissAll?: () => void },
): void {
  const dismissAll = callbacks.onDismissAll ?? (() => toast.dismiss(AGENT_APPLIED_TOAST_ID));
  const content = <AppliedFilesToast files={files} onDismissAll={dismissAll} onUndoAll={callbacks.onUndoAll} />;

  if (toast.isActive(AGENT_APPLIED_TOAST_ID)) {
    toast.update(AGENT_APPLIED_TOAST_ID, {
      render: content,
      type: 'success',
      autoClose: 4000,
      closeButton: true,
    });
  } else {
    toast.success(content, {
      toastId: AGENT_APPLIED_TOAST_ID,
      autoClose: 4000,
      closeButton: true,
    });
  }
}
