export const PROJECT_AGENT_PANEL_DEFAULT_WIDTH = 420;
export const PROJECT_AGENT_PANEL_MIN_WIDTH = 340;
export const PROJECT_AGENT_PANEL_MAX_WIDTH = 640;

export function clampProjectAgentPanelWidth(width: number) {
  return Math.min(PROJECT_AGENT_PANEL_MAX_WIDTH, Math.max(PROJECT_AGENT_PANEL_MIN_WIDTH, Math.round(width)));
}

export function defaultProjectAgentPanelWidth(viewportWidth?: number) {
  if (!viewportWidth || !Number.isFinite(viewportWidth)) {
    return PROJECT_AGENT_PANEL_DEFAULT_WIDTH;
  }

  return clampProjectAgentPanelWidth(viewportWidth * 0.25);
}
