import { atom } from 'nanostores';

/**
 * Which tab the Deployments panel should land on the next time it renders.
 *
 * Exists because `domains` is an aliased tool (see
 * `PROJECT_EDITOR_TOOL_ALIASES`): every door that used to open a standalone
 * Domains screen now opens Deployments instead, and has to say *which* tab it
 * meant. Without this the alias would drop the user on Overview and the
 * shortcut would read as a broken link.
 *
 * A store rather than a prop because the request is raised in `BaseChat`'s
 * panel-opening callbacks and consumed ~10 000 lines away inside
 * `ProjectDeploymentsPanel`, through a generic panel host that knows nothing
 * about deploy tabs.
 *
 * It is a ONE-SHOT request, not a source of truth: the panel consumes it and
 * clears it, so a later manual tab change is never overridden.
 */
export type DeployPanelView = 'overview' | 'logs' | 'domains' | 'manage';

export const requestedDeployPanelView = atom<DeployPanelView | undefined>(undefined);

/** Ask the Deployments panel to open on `view` when it next mounts or updates. */
export function requestDeployPanelView(view: DeployPanelView) {
  requestedDeployPanelView.set(view);
}

/**
 * Read and clear the pending request. Returns undefined when there is none, so
 * callers can leave their current tab alone.
 */
export function consumeDeployPanelView(): DeployPanelView | undefined {
  const view = requestedDeployPanelView.get();

  if (view) {
    requestedDeployPanelView.set(undefined);
  }

  return view;
}
