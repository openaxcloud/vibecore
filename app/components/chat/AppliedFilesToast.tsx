import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

import { formatAppliedFilesToastPlural, getAppliedFilesToastCopy } from '~/lib/i18n/catalogs/applied-files-toast';

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
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getAppliedFilesToastCopy(language);
  const visibleFiles = files.slice(0, 8);
  const remainingCount = Math.max(files.length - visibleFiles.length, 0);

  const appliedTitle = formatAppliedFilesToastPlural(language, files.length, {
    one: copy['appliedFilesToast.title_one'],
    other: copy['appliedFilesToast.title_other'],
  });
  const remainingLabel = formatAppliedFilesToastPlural(language, remainingCount, {
    one: copy['appliedFilesToast.remaining_one'],
    other: copy['appliedFilesToast.remaining_other'],
  });

  return (
    <div className="bolt-agent-applied-toast">
      <div className="bolt-agent-applied-toast-head" role="status" aria-live="polite">
        <strong>{appliedTitle}</strong>
        <span>{copy['appliedFilesToast.description']}</span>
      </div>
      <details>
        <summary>{copy['appliedFilesToast.details']}</summary>
        <ul>
          {visibleFiles.map((file) => (
            <li key={file} title={file}>
              {file}
            </li>
          ))}
          {remainingCount > 0 ? <li>{remainingLabel}</li> : null}
        </ul>
      </details>
      <div className="bolt-agent-applied-toast-actions">
        <button type="button" onClick={onUndoAll}>
          {copy['appliedFilesToast.undoAll']}
        </button>
        <button type="button" onClick={onDismissAll}>
          {copy['appliedFilesToast.dismissAll']}
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
