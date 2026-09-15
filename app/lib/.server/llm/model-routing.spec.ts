import { describe, expect, it } from 'vitest';
import {
  AUTO_MODEL,
  DEFAULT_ROUTE_TABLE,
  decideRoute,
  resolveRouteTable,
  type ProviderRoute,
  type RouteInput,
} from './model-routing';

/** Build a `RouteInput` with sensible auto-mode defaults, overridable per test. */
function makeInput(overrides: Partial<RouteInput> = {}): RouteInput {
  return {
    selectedModel: AUTO_MODEL,
    provider: 'Anthropic',
    frontierModel: 'claude-sonnet-4-5-20250929',
    task: { chatMode: 'build', lastUserMessage: 'add a footer', contextFileCount: 1 },
    ...overrides,
  };
}

describe('AUTO_MODEL', () => {
  it('is the "auto" sentinel', () => {
    expect(AUTO_MODEL).toBe('auto');
  });
});

describe('resolveRouteTable', () => {
  it('returns the default table when no override is present', () => {
    const table = resolveRouteTable({});
    expect(table.Anthropic).toEqual({ frontier: 'claude-opus-5', small: 'claude-haiku-4-5-20251001' });
    expect(table.OpenAI).toEqual({ frontier: 'gpt-4.1', small: 'gpt-4.1-mini' });
    expect(table.Google).toEqual({ frontier: 'gemini-2.5-pro', small: 'gemini-2.5-flash' });
  });

  it('has NO entry for xAI (and other providers) by default', () => {
    const table = resolveRouteTable({});
    expect(table.xAI).toBeUndefined();
    expect(table.Groq).toBeUndefined();
  });

  it('merges a valid per-provider override on top of the defaults', () => {
    const table = resolveRouteTable({
      MODEL_ROUTING_TABLE: JSON.stringify({ Anthropic: { frontier: 'claude-sonnet-4-6', small: 'claude-haiku-4-5' } }),
    });

    // Overridden…
    expect(table.Anthropic).toEqual({ frontier: 'claude-sonnet-4-6', small: 'claude-haiku-4-5' });

    // …while other providers keep their defaults.
    expect(table.OpenAI).toEqual({ frontier: 'gpt-4.1', small: 'gpt-4.1-mini' });
  });

  it('adds a brand-new provider entry from the override', () => {
    const table = resolveRouteTable({
      MODEL_ROUTING_TABLE: JSON.stringify({ xAI: { frontier: 'grok-4', small: 'grok-4-mini' } }),
    });
    expect(table.xAI).toEqual({ frontier: 'grok-4', small: 'grok-4-mini' });
  });

  it('ignores invalid JSON and falls back to defaults', () => {
    const table = resolveRouteTable({ MODEL_ROUTING_TABLE: '{ not valid json' });
    expect(table).toEqual(DEFAULT_ROUTE_TABLE);
  });

  it('ignores malformed per-provider entries (missing/blank fields, wrong types)', () => {
    const table = resolveRouteTable({
      MODEL_ROUTING_TABLE: JSON.stringify({
        Anthropic: { frontier: 'only-frontier' }, // missing small → ignored
        OpenAI: { frontier: '', small: 'gpt-4.1-mini' }, // blank frontier → ignored
        Google: 'not-an-object', // wrong type → ignored
      }),
    });
    expect(table).toEqual(DEFAULT_ROUTE_TABLE);
  });

  it('ignores a non-object JSON override (array / scalar)', () => {
    expect(resolveRouteTable({ MODEL_ROUTING_TABLE: JSON.stringify(['a', 'b']) })).toEqual(DEFAULT_ROUTE_TABLE);
    expect(resolveRouteTable({ MODEL_ROUTING_TABLE: '42' })).toEqual(DEFAULT_ROUTE_TABLE);
  });

  it('treats an empty env value as no override', () => {
    expect(resolveRouteTable({ MODEL_ROUTING_TABLE: '' })).toEqual(DEFAULT_ROUTE_TABLE);
  });
});

describe('decideRoute — guardrail #1: explicit selection', () => {
  it('never routes an explicit concrete model, even for a simple task', () => {
    const decision = decideRoute(
      makeInput({ selectedModel: 'claude-haiku-4-5-20251001', task: { chatMode: 'discuss' } }),
    );
    expect(decision.routed).toBe(false);
    expect(decision.model).toBe('claude-haiku-4-5-20251001');
    expect(decision.reason).toBe('explicit-selection');
  });
});

describe('decideRoute — auto mode downgrades', () => {
  it('routes a discuss turn to the Anthropic small model (haiku)', () => {
    const decision = decideRoute(makeInput({ task: { chatMode: 'discuss' } }));
    expect(decision.routed).toBe(true);
    expect(decision.model).toBe('claude-haiku-4-5-20251001');
    expect(decision.reason).toBe('downgraded:discuss');
    expect(decision.taskClass).toBe('discuss');
  });

  it('routes a discuss turn to the OpenAI small model (gpt-4.1-mini)', () => {
    const decision = decideRoute(
      makeInput({ provider: 'OpenAI', frontierModel: 'gpt-4.1', task: { chatMode: 'discuss' } }),
    );
    expect(decision.routed).toBe(true);
    expect(decision.model).toBe('gpt-4.1-mini');
  });

  it('routes a discuss turn to the Google small model (gemini-2.5-flash)', () => {
    const decision = decideRoute(
      makeInput({ provider: 'Google', frontierModel: 'gemini-2.5-pro', task: { chatMode: 'discuss' } }),
    );
    expect(decision.routed).toBe(true);
    expect(decision.model).toBe('gemini-2.5-flash');
  });

  it('routes a single-file smallEdit to the small model', () => {
    const decision = decideRoute(
      makeInput({ task: { chatMode: 'build', lastUserMessage: 'rename the header', contextFileCount: 1 } }),
    );
    expect(decision.routed).toBe(true);
    expect(decision.model).toBe('claude-haiku-4-5-20251001');
    expect(decision.reason).toBe('downgraded:smallEdit');
  });

  it('routes a smallEdit with zero context files', () => {
    const decision = decideRoute(
      makeInput({ task: { chatMode: 'build', lastUserMessage: 'fix typo', contextFileCount: 0 } }),
    );
    expect(decision.routed).toBe(true);
  });
});

describe('decideRoute — guardrail #2: eligibility', () => {
  it('keeps the frontier for a multi-file smallEdit (>1 file)', () => {
    const decision = decideRoute(
      makeInput({ task: { chatMode: 'build', lastUserMessage: 'rename the header', contextFileCount: 3 } }),
    );
    expect(decision.routed).toBe(false);
    expect(decision.model).toBe('claude-sonnet-4-5-20250929');
    expect(decision.reason).toBe('task-not-simple:smallEdit');
  });

  it('keeps the frontier for a build turn', () => {
    const decision = decideRoute(
      makeInput({ task: { chatMode: 'build', lastUserMessage: 'make it responsive', contextFileCount: 4 } }),
    );
    expect(decision.routed).toBe(false);
    expect(decision.reason).toBe('task-not-simple:build');
  });

  it('keeps the frontier for a scaffold turn', () => {
    const decision = decideRoute(
      makeInput({ task: { chatMode: 'build', lastUserMessage: 'build a todo app with auth' } }),
    );
    expect(decision.routed).toBe(false);
    expect(decision.reason).toBe('task-not-simple:scaffold');
  });

  it('keeps the frontier for a plan-first smallEdit (planFirst guard)', () => {
    const decision = decideRoute(
      makeInput({
        task: { chatMode: 'build', lastUserMessage: 'fix typo', contextFileCount: 1, planFirst: true },
      }),
    );

    // planFirst forces scaffold in classifyTask → not eligible.
    expect(decision.routed).toBe(false);
    expect(decision.taskClass).toBe('scaffold');
    expect(decision.reason).toBe('task-not-simple:scaffold');
  });
});

describe('decideRoute — guardrail #3: provider/usability', () => {
  it('keeps the frontier when the provider has no table entry (xAI)', () => {
    const decision = decideRoute(
      makeInput({ provider: 'xAI', frontierModel: 'grok-4', task: { chatMode: 'discuss' } }),
    );
    expect(decision.routed).toBe(false);
    expect(decision.model).toBe('grok-4');
    expect(decision.reason).toBe('no-small-for-provider');
  });

  it('keeps the frontier when the small model is not usable', () => {
    const decision = decideRoute(makeInput({ task: { chatMode: 'discuss' }, isProviderModelUsable: () => false }));
    expect(decision.routed).toBe(false);
    expect(decision.model).toBe('claude-sonnet-4-5-20250929');
    expect(decision.reason).toBe('small-model-unusable');
  });

  it('passes the small model id to the usability probe', () => {
    const seen: string[] = [];
    decideRoute(
      makeInput({
        task: { chatMode: 'discuss' },
        isProviderModelUsable: (id) => {
          seen.push(id);
          return true;
        },
      }),
    );
    expect(seen).toEqual(['claude-haiku-4-5-20251001']);
  });
});

describe('decideRoute — kill-switch', () => {
  it('never routes when routingDisabled, keeping frontier for auto', () => {
    const decision = decideRoute(makeInput({ task: { chatMode: 'discuss' }, routingDisabled: true }));
    expect(decision.routed).toBe(false);
    expect(decision.model).toBe('claude-sonnet-4-5-20250929');
    expect(decision.reason).toBe('routing-disabled');
  });

  it('honours an explicit selection when routingDisabled', () => {
    const decision = decideRoute(
      makeInput({ selectedModel: 'gpt-4o', task: { chatMode: 'discuss' }, routingDisabled: true }),
    );
    expect(decision.routed).toBe(false);
    expect(decision.model).toBe('gpt-4o');
    expect(decision.reason).toBe('routing-disabled');
  });
});

describe('decideRoute — custom table + telemetry', () => {
  it('routes using a caller-supplied table override', () => {
    const table: Record<string, ProviderRoute> = { xAI: { frontier: 'grok-4', small: 'grok-4-mini' } };

    const decision = decideRoute(
      makeInput({ provider: 'xAI', frontierModel: 'grok-4', task: { chatMode: 'discuss' }, table }),
    );
    expect(decision.routed).toBe(true);
    expect(decision.model).toBe('grok-4-mini');
  });

  it('always carries {from, to, reason, taskClass} for telemetry', () => {
    const decision = decideRoute(makeInput({ task: { chatMode: 'discuss' } }));
    expect(decision.from).toBe('claude-sonnet-4-5-20250929');
    expect(decision.to).toBe('claude-haiku-4-5-20251001');
    expect(decision.reason).toBe('downgraded:discuss');
    expect(decision.taskClass).toBe('discuss');

    // `to` always equals `model`.
    expect(decision.to).toBe(decision.model);
  });

  it('sets from=frontier and to=model on a non-routed decision too', () => {
    const decision = decideRoute(
      makeInput({ task: { chatMode: 'build', lastUserMessage: 'build a full app from scratch' } }),
    );
    expect(decision.from).toBe('claude-sonnet-4-5-20250929');
    expect(decision.to).toBe(decision.model);
    expect(decision.to).toBe('claude-sonnet-4-5-20250929');
  });
});
