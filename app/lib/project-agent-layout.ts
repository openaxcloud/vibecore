export const PROJECT_AGENT_PANEL_DEFAULT_WIDTH = 360;
export const PROJECT_AGENT_PANEL_MIN_WIDTH = 340;
export const PROJECT_AGENT_PANEL_MAX_WIDTH = 560;

export function clampProjectAgentPanelWidth(width: number) {
  return Math.min(PROJECT_AGENT_PANEL_MAX_WIDTH, Math.max(PROJECT_AGENT_PANEL_MIN_WIDTH, Math.round(width)));
}

export function defaultProjectAgentPanelWidth(viewportWidth?: number) {
  if (!viewportWidth || !Number.isFinite(viewportWidth)) {
    return PROJECT_AGENT_PANEL_DEFAULT_WIDTH;
  }

  return clampProjectAgentPanelWidth(viewportWidth * 0.25);
}

const PROJECT_AGENT_STOP_COPY = {
  en: { claude: 'Stop Claude', agent: 'Stop agent' },
  fr: { claude: 'Arrêter Claude', agent: 'Arrêter l’agent' },
} as const;

export function projectAgentStopLabel(providerName?: string, model?: string, language?: string | null) {
  const target = `${providerName ?? ''} ${model ?? ''}`.toLowerCase();
  const copy = language?.toLowerCase().startsWith('fr') ? PROJECT_AGENT_STOP_COPY.fr : PROJECT_AGENT_STOP_COPY.en;

  return target.includes('anthropic') || target.includes('claude') ? copy.claude : copy.agent;
}
