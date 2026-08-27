import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_AGENT_MODE,
  boltProviderName,
  decideTaskHardness,
  isAgentModeRoutingDisabled,
  normalizeAgentSelection,
} from './agent-mode';

describe('normalizeAgentSelection', () => {
  it('defaults to economy with both switches off', () => {
    expect(DEFAULT_AGENT_MODE).toBe('economy');
    expect(normalizeAgentSelection(undefined)).toEqual({ mode: 'economy', highEffort: false, turbo: false });
    expect(normalizeAgentSelection({ buildTier: 'nonsense' })).toEqual({
      mode: 'economy',
      highEffort: false,
      turbo: false,
    });
  });

  it('never allows High effort in Lite (product rule) and maps legacy highPowerModel', () => {
    expect(normalizeAgentSelection({ buildTier: 'lite', highEffort: true })).toEqual({
      mode: 'lite',
      highEffort: false,
      turbo: false,
    });
    expect(normalizeAgentSelection({ buildTier: 'economy', highPowerModel: true })).toEqual({
      mode: 'economy',
      highEffort: true,
      turbo: false,
    });
  });

  it('only allows Turbo in Power', () => {
    expect(normalizeAgentSelection({ buildTier: 'economy', turboMode: true }).turbo).toBe(false);
    expect(normalizeAgentSelection({ buildTier: 'power', turboMode: true })).toEqual({
      mode: 'power',
      highEffort: false,
      turbo: true,
    });
  });
});

describe('boltProviderName', () => {
  it('maps the routing-card gateway ids to Bolt provider registry names', () => {
    expect(boltProviderName('anthropic')).toBe('Anthropic');
    expect(boltProviderName('openai')).toBe('OpenAI');
    expect(boltProviderName('google-gemini')).toBe('Google');
    expect(boltProviderName('unknown-thing')).toBe('unknown-thing');
  });
});

describe('isAgentModeRoutingDisabled', () => {
  it('is OFF unless the kill-switch is explicitly set', () => {
    expect(isAgentModeRoutingDisabled({})).toBe(false);
    expect(isAgentModeRoutingDisabled({ AGENT_MODE_ROUTING_DISABLED: '' })).toBe(false);
    expect(isAgentModeRoutingDisabled({ AGENT_MODE_ROUTING_DISABLED: '0' })).toBe(false);
    expect(isAgentModeRoutingDisabled({ AGENT_MODE_ROUTING_DISABLED: '1' })).toBe(true);
    expect(isAgentModeRoutingDisabled({ AGENT_MODE_ROUTING_DISABLED: 'true' })).toBe(true);
  });
});

describe('decideTaskHardness (heuristic gate)', () => {
  it.each([
    ['hard' as const, true],
    ['easy' as const, false],
  ])('replays an exact %s classifier receipt without another provider effect', async (outcome, hard) => {
    const onClassifierStart = vi.fn();

    const decision = await decideTaskHardness({
      task: {
        chatMode: 'build',
        lastUserMessage: 'build a production marketplace with auth, billing, and migrations',
        contextFileCount: 0,
        planFirst: true,
        isReasoningModel: false,
      },
      lastUserMessage: 'build a production marketplace with auth, billing, and migrations',
      classifier: { provider: 'anthropic', model: 'claude-haiku-4-5' },
      classifierReplay: { state: 'exact', outcome },
      onClassifierStart,
    });

    expect(decision).toMatchObject({ hard, decidedBy: 'llm' });
    expect(decision.classifierUsage).toBeUndefined();
    expect(onClassifierStart).not.toHaveBeenCalled();
  });

  it('uses the hard heuristic for a recovered classifier ceiling without replaying the provider', async () => {
    const onClassifierStart = vi.fn();

    const decision = await decideTaskHardness({
      task: {
        chatMode: 'build',
        lastUserMessage: 'build a production marketplace with auth, billing, and migrations',
        contextFileCount: 0,
        planFirst: true,
        isReasoningModel: false,
      },
      lastUserMessage: 'build a production marketplace with auth, billing, and migrations',
      classifier: { provider: 'anthropic', model: 'claude-haiku-4-5' },
      classifierReplay: { state: 'recovered' },
      onClassifierStart,
    });

    expect(decision).toMatchObject({ hard: true, decidedBy: 'heuristic' });
    expect(decision.classifierUsage).toBeUndefined();
    expect(onClassifierStart).not.toHaveBeenCalled();
  });

  it('never escalates a small edit or a discussion — the "+0 credit" path', async () => {
    const smallEdit = await decideTaskHardness({
      task: {
        chatMode: 'build',
        lastUserMessage: 'change the button color to blue',
        contextFileCount: 1,
        planFirst: false,
        isReasoningModel: false,
      },
      lastUserMessage: 'change the button color to blue',
      classifier: { provider: 'anthropic', model: 'claude-haiku-4-5' },
    });

    expect(smallEdit.hard).toBe(false);
    expect(smallEdit.decidedBy).toBe('heuristic');
    expect(smallEdit.classifierUsage).toBeUndefined();

    const discuss = await decideTaskHardness({
      task: {
        chatMode: 'discuss',
        lastUserMessage: 'why is my app slow?',
        contextFileCount: 0,
        planFirst: false,
        isReasoningModel: false,
      },
      lastUserMessage: 'why is my app slow?',
    });
    expect(discuss.hard).toBe(false);
  });

  it('falls back to the heuristic verdict when the LLM classifier is unavailable', async () => {
    // No credentials in the test env → the classifier call throws → heuristic "hard" wins.
    const scaffold = await decideTaskHardness({
      task: {
        chatMode: 'build',
        lastUserMessage: 'build me a full marketplace app with auth, payments and a database schema',
        contextFileCount: 0,
        planFirst: true,
        isReasoningModel: false,
      },
      lastUserMessage: 'build me a full marketplace app with auth, payments and a database schema',
      classifier: { provider: 'anthropic', model: 'claude-haiku-4-5' },
    });

    expect(scaffold.hard).toBe(true);
  });
});
