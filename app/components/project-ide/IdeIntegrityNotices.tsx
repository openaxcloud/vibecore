import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatIdeIntegrityCopy, getIdeIntegrityCopy } from '~/lib/i18n/catalogs/ide-integrity';
import { workbenchStore, type FileSaveConflictResolution } from '~/lib/stores/workbench';

export function WorkspaceQuotaNotice() {
  const { i18n } = useTranslation();
  const copy = getIdeIntegrityCopy(i18n.resolvedLanguage ?? i18n.language);
  const warning = useStore(workbenchStore.quotaWarning);
  const upgrade = useStore(workbenchStore.billingUpgradePrompt);
  const loading = useStore(workbenchStore.workspaceLoading);

  if (!warning && !upgrade) {
    return null;
  }

  return (
    <section
      className="vc-ide-integrity-notice vc-ide-integrity-notice-quota"
      role="alert"
      aria-live="assertive"
      aria-label={copy['ideIntegrity.quota.label']}
      data-testid="workspace-quota-notice"
    >
      <span className="i-ph:gauge-duotone vc-ide-integrity-notice-icon" aria-hidden />
      <div className="vc-ide-integrity-notice-copy">
        <strong>{copy['ideIntegrity.quota.title']}</strong>
        {warning ? <p>{warning}</p> : null}
        {upgrade ? <p>{upgrade}</p> : null}
      </div>
      <div className="vc-ide-integrity-notice-actions">
        <button
          type="button"
          className="vc-ide-integrity-action vc-ide-integrity-action-primary"
          onClick={() => workbenchStore.requestWorkspaceRetry()}
          disabled={loading}
          aria-busy={loading}
        >
          <span className={loading ? 'i-svg-spinners:90-ring-with-bg' : 'i-ph:arrow-clockwise'} aria-hidden />
          {loading ? copy['ideIntegrity.quota.retrying'] : copy['ideIntegrity.quota.retry']}
        </button>
        <a className="vc-ide-integrity-action" href="/billing" target="_blank" rel="noopener noreferrer">
          <span className="i-ph:credit-card" aria-hidden />
          {copy['ideIntegrity.quota.billing']}
        </a>
      </div>
    </section>
  );
}

export function FileSaveIssueNotice({ filePath }: { filePath?: string }) {
  const { i18n } = useTranslation();
  const copy = getIdeIntegrityCopy(i18n.resolvedLanguage ?? i18n.language);
  const issues = useStore(workbenchStore.fileSaveIssues);
  const [busyAction, setBusyAction] = useState<'retry' | FileSaveConflictResolution>();
  const [actionFailed, setActionFailed] = useState(false);

  const issuePaths = Object.keys(issues).sort(
    (left, right) => (issues[left]?.detectedAt ?? 0) - (issues[right]?.detectedAt ?? 0),
  );

  const resolvedFilePath = filePath && issues[filePath] ? filePath : issuePaths[0];
  const issue = resolvedFilePath ? issues[resolvedFilePath] : undefined;
  const hasIssue = Boolean(issue);

  useEffect(() => {
    setBusyAction(undefined);
    setActionFailed(false);
  }, [resolvedFilePath, hasIssue]);

  if (!resolvedFilePath || !issue) {
    return null;
  }

  const fileName = resolvedFilePath.split('/').pop() ?? resolvedFilePath;
  const conflict = issue.kind === 'conflict';

  const runAction = async (action: 'retry' | FileSaveConflictResolution) => {
    setBusyAction(action);
    setActionFailed(false);

    try {
      if (action === 'retry') {
        await workbenchStore.retryFileSave(resolvedFilePath);
      } else {
        await workbenchStore.resolveFileSaveConflict(resolvedFilePath, action);
      }
    } catch {
      setActionFailed(true);
    } finally {
      setBusyAction(undefined);
    }
  };

  const openRecovery = () => {
    workbenchStore.setSelectedFile(resolvedFilePath);
    window.dispatchEvent(new CustomEvent('vibecore:open-editor-file', { detail: { filePath: resolvedFilePath } }));
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('vibecore:open-file-history', { detail: { filePath: resolvedFilePath } }));
    }, 0);
  };

  return (
    <section
      className="vc-ide-integrity-notice vc-ide-integrity-notice-save"
      role="alert"
      aria-live="assertive"
      aria-label={copy['ideIntegrity.save.label']}
      data-testid="file-save-issue-notice"
      data-kind={issue.kind}
      data-file-path={resolvedFilePath}
    >
      <span className="i-ph:files-duotone vc-ide-integrity-notice-icon" aria-hidden />
      <div className="vc-ide-integrity-notice-copy">
        <strong>
          {formatIdeIntegrityCopy(copy[conflict ? 'ideIntegrity.save.conflictTitle' : 'ideIntegrity.save.errorTitle'], {
            file: fileName,
          })}
        </strong>
        <p>{copy[conflict ? 'ideIntegrity.save.conflictDescription' : 'ideIntegrity.save.errorDescription']}</p>
        {conflict ? <p>{copy['ideIntegrity.save.recovery']}</p> : null}
        {issuePaths.length > 1 ? (
          <p>
            {formatIdeIntegrityCopy(copy['ideIntegrity.save.moreIssues'], { count: String(issuePaths.length - 1) })}
          </p>
        ) : null}
        {actionFailed ? (
          <p className="vc-ide-integrity-notice-action-error" role="alert">
            {copy['ideIntegrity.save.actionFailed']}
          </p>
        ) : null}
      </div>
      <div className="vc-ide-integrity-notice-actions">
        <button type="button" className="vc-ide-integrity-action" onClick={openRecovery} disabled={!!busyAction}>
          <span className="i-ph:clock-counter-clockwise" aria-hidden />
          {copy['ideIntegrity.save.review']}
        </button>
        {conflict ? (
          <>
            <button
              type="button"
              className="vc-ide-integrity-action"
              onClick={() => void runAction('use-remote')}
              disabled={!!busyAction}
            >
              <span className="i-ph:cloud-arrow-down" aria-hidden />
              {busyAction === 'use-remote' ? copy['ideIntegrity.save.resolving'] : copy['ideIntegrity.save.useRemote']}
            </button>
            <button
              type="button"
              className="vc-ide-integrity-action vc-ide-integrity-action-primary"
              onClick={() => void runAction('keep-local')}
              disabled={!!busyAction}
            >
              <span className="i-ph:floppy-disk" aria-hidden />
              {busyAction === 'keep-local' ? copy['ideIntegrity.save.resolving'] : copy['ideIntegrity.save.keepLocal']}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="vc-ide-integrity-action vc-ide-integrity-action-primary"
            onClick={() => void runAction('retry')}
            disabled={!!busyAction}
          >
            <span
              className={busyAction === 'retry' ? 'i-svg-spinners:90-ring-with-bg' : 'i-ph:arrow-clockwise'}
              aria-hidden
            />
            {busyAction === 'retry' ? copy['ideIntegrity.save.resolving'] : copy['ideIntegrity.save.retry']}
          </button>
        )}
      </div>
    </section>
  );
}
