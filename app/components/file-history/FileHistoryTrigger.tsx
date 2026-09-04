import { forwardRef } from 'react';

export interface FileHistoryTriggerProps {
  onClick: () => void;
}

export const FileHistoryTrigger = forwardRef<HTMLButtonElement, FileHistoryTriggerProps>(({ onClick }, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      className="vc-file-history-trigger"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label="Open file history"
      title="History — browse, compare, replay, or restore earlier versions"
      data-testid="file-history-trigger"
    >
      <span className="i-ph:clock-counter-clockwise-duotone" aria-hidden />
      <span>History</span>
    </button>
  );
});

FileHistoryTrigger.displayName = 'FileHistoryTrigger';
