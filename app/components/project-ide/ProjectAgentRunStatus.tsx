interface ProjectAgentRunStatusProps {
  stopLabel: string;
  disabled?: boolean;
  onStop?: () => void;
}

export function ProjectAgentRunStatus({ stopLabel, disabled = false, onStop }: ProjectAgentRunStatusProps) {
  const stopDisabled = disabled || !onStop;

  return (
    <div
      className="bolt-project-agent-run-status"
      aria-label="AI agent generation status"
      data-testid="project-agent-run-status"
    >
      <div className="bolt-project-agent-run-status-copy" role="status" aria-live="polite">
        <span className="bolt-project-agent-run-status-indicator" aria-hidden>
          <span className="i-svg-spinners:90-ring-with-bg" />
        </span>
        <span>
          <strong>Agent running</strong>
          <small>Streaming response and workspace actions.</small>
        </span>
      </div>
      <button
        type="button"
        className="bolt-project-agent-stop-button"
        aria-label={stopLabel}
        title={`${stopLabel} — press Esc`}
        disabled={stopDisabled}
        onClick={() => onStop?.()}
      >
        <span className="i-ph:stop-circle-bold" aria-hidden />
        <span>{stopLabel}</span>
      </button>
      <span className="text-[11px] text-bolt-elements-textTertiary" aria-hidden>
        Esc to stop
      </span>
    </div>
  );
}
