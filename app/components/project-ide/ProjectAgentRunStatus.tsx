import { useTranslation } from 'react-i18next';
import { formatWorkspaceMiscCopy, getWorkspaceMiscCopy } from '~/lib/i18n/catalogs/workspace-misc';

interface ProjectAgentRunStatusProps {
  stopLabel: string;
  disabled?: boolean;
  onStop?: () => void;
}

export function ProjectAgentRunStatus({ stopLabel, disabled = false, onStop }: ProjectAgentRunStatusProps) {
  const { i18n } = useTranslation();
  const copy = getWorkspaceMiscCopy(i18n.resolvedLanguage ?? i18n.language);
  const stopDisabled = disabled || !onStop;

  return (
    <div
      className="bolt-project-agent-run-status"
      aria-label={copy['workspaceMisc.agentRun.aria']}
      data-testid="project-agent-run-status"
    >
      <div className="bolt-project-agent-run-status-copy" role="status" aria-live="polite">
        <span className="bolt-project-agent-run-status-indicator" aria-hidden>
          <span className="i-svg-spinners:90-ring-with-bg" />
        </span>
        <span>
          <strong>{copy['workspaceMisc.agentRun.title']}</strong>
          <small>{copy['workspaceMisc.agentRun.description']}</small>
        </span>
      </div>
      <button
        type="button"
        className="bolt-project-agent-stop-button min-h-11 max-w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-error)]"
        aria-label={stopLabel}
        title={formatWorkspaceMiscCopy(copy['workspaceMisc.agentRun.stop.title'], { label: stopLabel })}
        disabled={stopDisabled}
        onClick={() => onStop?.()}
      >
        <span className="i-ph:stop-circle-bold" aria-hidden />
        <span>{stopLabel}</span>
      </button>
      <span className="text-[11px] text-bolt-elements-textTertiary" aria-hidden>
        {copy['workspaceMisc.agentRun.stop.hint']}
      </span>
    </div>
  );
}
