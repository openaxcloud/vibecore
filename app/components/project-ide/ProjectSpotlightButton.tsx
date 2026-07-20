export const OPEN_PROJECT_IDE_PANEL_EVENT = 'vibecore:open-project-ide-panel';

export interface ProjectIdePanelEventDetail {
  panel: string;
}

export function openProjectSpotlight(): void {
  window.dispatchEvent(
    new CustomEvent<ProjectIdePanelEventDetail>(OPEN_PROJECT_IDE_PANEL_EVENT, {
      detail: { panel: 'overview' },
    }),
  );
}

export function ProjectSpotlightButton({
  projectName,
  tooltip = projectName,
  triggerTestId = 'project-spotlight-trigger',
}: {
  projectName: string;
  tooltip?: string;
  triggerTestId?: string;
}) {
  return (
    <button
      type="button"
      className={`bolt-project-name-trigger ${styles.trigger}`}
      title={`${tooltip} — open Project Spotlight`}
      data-vc-tooltip={`${tooltip} — open Project Spotlight`}
      data-vc-tooltip-locked="true"
      aria-label={`Open Project Spotlight for ${projectName}`}
      data-testid={triggerTestId}
      onClick={openProjectSpotlight}
    >
      <span className="bolt-project-breadcrumb-kicker">Project Editor</span>
      <span className="bolt-project-breadcrumb-value truncate" title={tooltip}>
        {projectName}
      </span>
    </button>
  );
}
import styles from './ProjectSpotlightButton.module.scss';
