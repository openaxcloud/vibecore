import { describe, expect, it } from 'vitest';
import {
  PROJECT_AGENT_PANEL_DEFAULT_WIDTH,
  PROJECT_AGENT_PANEL_MAX_WIDTH,
  PROJECT_AGENT_PANEL_MIN_WIDTH,
  clampProjectAgentPanelWidth,
  defaultProjectAgentPanelWidth,
  projectAgentStopLabel,
} from './project-agent-layout';

describe('project agent panel layout', () => {
  it('keeps the agent panel wide enough to remain readable', () => {
    expect(clampProjectAgentPanelWidth(240)).toBe(PROJECT_AGENT_PANEL_MIN_WIDTH);
    expect(clampProjectAgentPanelWidth(360)).toBe(360);
    expect(clampProjectAgentPanelWidth(900)).toBe(PROJECT_AGENT_PANEL_MAX_WIDTH);
  });

  it('uses 25 percent of the viewport as the desktop default with hard bounds', () => {
    expect(defaultProjectAgentPanelWidth(1440)).toBe(360);
    expect(defaultProjectAgentPanelWidth(960)).toBe(PROJECT_AGENT_PANEL_MIN_WIDTH);
    expect(defaultProjectAgentPanelWidth(3200)).toBe(PROJECT_AGENT_PANEL_MAX_WIDTH);
    expect(defaultProjectAgentPanelWidth()).toBe(PROJECT_AGENT_PANEL_DEFAULT_WIDTH);
  });

  it('names the running agent stop action from the active provider or model', () => {
    expect(projectAgentStopLabel('Anthropic', 'claude-sonnet-4.5')).toBe('Stop Claude');
    expect(projectAgentStopLabel('OpenRouter', 'anthropic/claude-sonnet-4.5')).toBe('Stop Claude');
    expect(projectAgentStopLabel('OpenAI', 'gpt-5.4')).toBe('Stop agent');
    expect(projectAgentStopLabel('Anthropic', 'claude-sonnet-4.5', 'fr-FR')).toBe('Arrêter Claude');
    expect(projectAgentStopLabel('OpenAI', 'gpt-5.4', 'fr-FR')).toBe('Arrêter l’agent');
  });
});
