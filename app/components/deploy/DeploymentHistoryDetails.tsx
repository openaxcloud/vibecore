import { useTranslation } from 'react-i18next';
import { lignesDeJournal, type Deploiement } from './publication';
import { RelativeTime } from '~/components/ui/RelativeTime';
import {
  formatProjectCopyPlural,
  getProjectDeploymentsCopy,
  interpolateProjectCopy,
  resolveProjectUserAreaLanguage,
} from '~/lib/i18n/catalogs/project-user-area';
import { formatDeploymentDuration } from '~/routes/projects.$projectId.deployments.view';

export interface DeploymentHistoryRecord extends Deploiement {
  rolledBackFromId?: string;
  finishedAt?: string;
  customDomain?: string;
}

/** Historical diagnostics retained when the legacy deployments page redirects into the IDE. */
export function DeploymentHistoryDetails({ deployment }: { deployment: DeploymentHistoryRecord }) {
  const { i18n } = useTranslation();
  const language = resolveProjectUserAreaLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getProjectDeploymentsCopy(language);
  const duration = formatDeploymentDuration(deployment.startedAt, deployment.finishedAt ?? deployment.completedAt);
  const logs = lignesDeJournal(deployment);

  return (
    <div
      className="min-w-0 grid gap-2 text-xs text-bolt-elements-textSecondary"
      data-testid="deployment-history-details"
    >
      <div className="flex flex-wrap gap-3">
        {deployment.framework ? <span>{deployment.framework}</span> : null}
        {deployment.commitSha ? <code title={deployment.commitSha}>{deployment.commitSha.slice(0, 7)}</code> : null}
        {deployment.branch ? <span>{deployment.branch}</span> : null}
        {duration ? <span title={copy.row.durationTitle}>{duration}</span> : null}
        {deployment.createdAt ? <RelativeTime value={deployment.createdAt} prefix={copy.row.deployedPrefix} /> : null}
        {deployment.rolledBackFromId ? (
          <span title={interpolateProjectCopy(copy.row.rollbackTitle, { deploymentId: deployment.rolledBackFromId })}>
            {copy.row.rollbackBadge}
          </span>
        ) : null}
        {deployment.customDomain ? <span className="break-all">{deployment.customDomain}</span> : null}
      </div>
      <details>
        <summary className="cursor-pointer py-2">
          {copy.logs.redacted} ·{' '}
          {formatProjectCopyPlural(language, logs.length, { one: copy.logs.line_one, other: copy.logs.line_other })}
        </summary>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words">
          {logs.join('\n') || copy.logs.noLogs}
        </pre>
      </details>
    </div>
  );
}
