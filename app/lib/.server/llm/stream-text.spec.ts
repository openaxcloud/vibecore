import { describe, expect, it, vi } from 'vitest';
import { AUTO_MODEL } from './model-routing';
import {
  applyContextOptimizedHistoryWindow,
  DEFAULT_STREAM_MAX_RETRIES,
  fingerprintPrompt,
  getCompletionTokenLimit,
  isModelRoutingDisabled,
  resolveStreamMaxRetries,
  resolveTurnModel,
} from './stream-text';
import { DEFAULT_MODEL } from '~/utils/constants';

const ANTHROPIC_FRONTIER = 'claude-sonnet-4-5-20250929';
const ANTHROPIC_SMALL = 'claude-haiku-4-5-20251001';

// A provider-usability probe that mirrors the real Anthropic static catalog.
const anthropicUsable = (id: string) => id === ANTHROPIC_FRONTIER || id === ANTHROPIC_SMALL;

/** Convenience: run resolveTurnModel with a captured telemetry sink. */
function runRoute(
  overrides: Partial<Parameters<typeof resolveTurnModel>[0]> & {
    task?: Parameters<typeof resolveTurnModel>[0]['task'];
  } = {},
) {
  const emitted: Array<{ event: string; meta: Record<string, unknown> }> = [];

  const result = resolveTurnModel(
    {
      selectedModel: AUTO_MODEL,
      providerName: 'Anthropic',
      isModelUsable: anthropicUsable,
      env: {},
      task: { chatMode: 'build', lastUserMessage: 'add a footer', contextFileCount: 1, planFirst: false },
      ...overrides,
    },
    (event, meta) => emitted.push({ event, meta }),
  );

  return { result, emitted };
}

describe('fingerprintPrompt', () => {
  it('is deterministic for identical strings (byte-stable head → same fingerprint)', () => {
    const head = 'You are E-Code, a senior engineer. '.repeat(50);
    expect(fingerprintPrompt(head)).toBe(fingerprintPrompt(head));
  });

  it('changes when a single byte of the head changes', () => {
    const head = 'You are E-Code, a senior engineer. '.repeat(50);
    expect(fingerprintPrompt(head)).not.toBe(fingerprintPrompt(head + 'x'));
  });
});

describe('resolveStreamMaxRetries', () => {
  it('auto-retries transient provider failures by default (more than the SDK default of 2)', () => {
    expect(resolveStreamMaxRetries(undefined)).toBe(DEFAULT_STREAM_MAX_RETRIES);
    expect(DEFAULT_STREAM_MAX_RETRIES).toBeGreaterThan(2);
  });

  it('honors a valid STREAM_MAX_RETRIES override and clamps it to a sane bound', () => {
    expect(resolveStreamMaxRetries({ STREAM_MAX_RETRIES: '6' })).toBe(6);
    expect(resolveStreamMaxRetries({ STREAM_MAX_RETRIES: '0' })).toBe(0);
    expect(resolveStreamMaxRetries({ STREAM_MAX_RETRIES: '99' })).toBe(8);
  });

  it('falls back to the default for missing or invalid values', () => {
    expect(resolveStreamMaxRetries({ STREAM_MAX_RETRIES: 'abc' })).toBe(DEFAULT_STREAM_MAX_RETRIES);
    expect(resolveStreamMaxRetries({ STREAM_MAX_RETRIES: '-3' })).toBe(DEFAULT_STREAM_MAX_RETRIES);
    expect(resolveStreamMaxRetries({})).toBe(DEFAULT_STREAM_MAX_RETRIES);
  });
});

describe('applyContextOptimizedHistoryWindow', () => {
  it('keeps the full recent conversation when no slice is needed', () => {
    const messages = ['first user request', 'assistant response', 'follow-up request'];

    expect(applyContextOptimizedHistoryWindow(messages, 0)).toEqual(messages);
    expect(applyContextOptimizedHistoryWindow(messages)).toEqual(messages);
  });

  it('keeps the requested recent history window when the conversation is long', () => {
    const messages = ['m1', 'm2', 'm3', 'm4', 'm5'];

    expect(applyContextOptimizedHistoryWindow(messages, 2)).toEqual(['m4', 'm5']);
  });
});

describe('getCompletionTokenLimit', () => {
  it('uses model-specific completion limits instead of the context window', () => {
    expect(
      getCompletionTokenLimit({
        provider: 'Anthropic',
        maxTokenAllowed: 200_000,
        maxCompletionTokens: 64_000,
      }),
    ).toBe(64_000);
  });

  it('falls back to the provider default when the model omits a completion limit', () => {
    /*
     * Regression: the OpenAI/Github default was 4096, which truncated multi-file
     * generations mid-file. It must now be a modern, non-truncating floor.
     */
    expect(getCompletionTokenLimit({ provider: 'OpenAI', maxTokenAllowed: 128_000 })).toBe(16384);
    expect(getCompletionTokenLimit({ provider: 'Github', maxTokenAllowed: 128_000 })).toBe(16384);
  });

  it('never falls back below a generation-safe floor for known providers', () => {
    for (const provider of ['OpenAI', 'Github', 'Anthropic', 'Google', 'Mistral', 'xAI']) {
      expect(getCompletionTokenLimit({ provider, maxTokenAllowed: 128_000 })).toBeGreaterThanOrEqual(8192);
    }
  });

  it('honours a low model ceiling so a 4096-cap model never asks for more (gpt-4-turbo bug)', () => {
    /*
     * gpt-4-turbo really supports only 4096 completion tokens. Its model entry
     * now carries maxCompletionTokens: 4096, and the sent max_tokens must equal
     * that ceiling — not the old inferred 8192, which the OpenAI API rejects.
     */
    expect(
      getCompletionTokenLimit({
        provider: 'OpenAI',
        name: 'gpt-4-turbo',
        maxTokenAllowed: 128_000,
        maxCompletionTokens: 4096,
      }),
    ).toBe(4096);
  });
});

describe('isModelRoutingDisabled (kill-switch)', () => {
  it('is OFF by default and for falsy values', () => {
    expect(isModelRoutingDisabled(undefined)).toBe(false);
    expect(isModelRoutingDisabled({})).toBe(false);
    expect(isModelRoutingDisabled({ MODEL_ROUTING_DISABLED: '' })).toBe(false);
    expect(isModelRoutingDisabled({ MODEL_ROUTING_DISABLED: '0' })).toBe(false);
    expect(isModelRoutingDisabled({ MODEL_ROUTING_DISABLED: 'false' })).toBe(false);
    expect(isModelRoutingDisabled({ MODEL_ROUTING_DISABLED: 'no' })).toBe(false);
  });

  it('is ON for truthy switch values (case-insensitive)', () => {
    expect(isModelRoutingDisabled({ MODEL_ROUTING_DISABLED: '1' })).toBe(true);
    expect(isModelRoutingDisabled({ MODEL_ROUTING_DISABLED: 'true' })).toBe(true);
    expect(isModelRoutingDisabled({ MODEL_ROUTING_DISABLED: 'TRUE' })).toBe(true);
    expect(isModelRoutingDisabled({ MODEL_ROUTING_DISABLED: 'yes' })).toBe(true);
    expect(isModelRoutingDisabled({ MODEL_ROUTING_DISABLED: 'on' })).toBe(true);
  });
});

describe('resolveTurnModel (stream-text routing wiring)', () => {
  it('auto + discuss → small model', () => {
    const { result, emitted } = runRoute({ task: { chatMode: 'discuss', lastUserMessage: 'why is the sky blue?' } });
    expect(result.model).toBe(ANTHROPIC_SMALL);
    expect(result.decision.routed).toBe(true);
    expect(result.decision.taskClass).toBe('discuss');

    // Telemetry fires for Auto with the full decision context.
    expect(emitted).toHaveLength(1);
    expect(emitted[0].event).toBe('opt.routing');
    expect(emitted[0].meta).toMatchObject({
      from: ANTHROPIC_FRONTIER,
      to: ANTHROPIC_SMALL,
      reason: expect.any(String),
      taskClass: 'discuss',
      routed: true,
      provider: 'Anthropic',
    });
  });

  it('auto + smallEdit + 1 file → small model', () => {
    const { result } = runRoute({
      task: { chatMode: 'build', lastUserMessage: 'change the header color', contextFileCount: 1, planFirst: false },
    });
    expect(result.decision.taskClass).toBe('smallEdit');
    expect(result.model).toBe(ANTHROPIC_SMALL);
    expect(result.decision.routed).toBe(true);
  });

  it('auto + smallEdit + 3 files → frontier (multi-file guardrail)', () => {
    const { result } = runRoute({
      task: { chatMode: 'build', lastUserMessage: 'change the header color', contextFileCount: 3, planFirst: false },
    });
    expect(result.decision.taskClass).toBe('smallEdit');
    expect(result.model).toBe(ANTHROPIC_FRONTIER);
    expect(result.decision.routed).toBe(false);
  });

  it('auto + build → frontier', () => {
    const { result } = runRoute({
      task: {
        chatMode: 'build',
        lastUserMessage: 'refactor the checkout flow to support saved payment methods',
        contextFileCount: 4,
        planFirst: false,
      },
    });
    expect(result.decision.taskClass).toBe('build');
    expect(result.model).toBe(ANTHROPIC_FRONTIER);
    expect(result.decision.routed).toBe(false);
  });

  it('auto + scaffold → frontier', () => {
    const { result } = runRoute({
      task: { chatMode: 'build', lastUserMessage: 'build a full-stack analytics dashboard', contextFileCount: 0 },
    });
    expect(result.decision.taskClass).toBe('scaffold');
    expect(result.model).toBe(ANTHROPIC_FRONTIER);
    expect(result.decision.routed).toBe(false);
  });

  it('auto + planFirst → frontier', () => {
    const { result } = runRoute({
      task: { chatMode: 'build', lastUserMessage: 'add a footer', contextFileCount: 1, planFirst: true },
    });
    expect(result.model).toBe(ANTHROPIC_FRONTIER);
    expect(result.decision.routed).toBe(false);
  });

  it('explicit model selection → unchanged, NEVER routed, NO telemetry', () => {
    const { result, emitted } = runRoute({
      selectedModel: 'gpt-4o',
      providerName: 'OpenAI',
      isModelUsable: () => true,
      task: { chatMode: 'discuss', lastUserMessage: 'why is the sky blue?' },
    });
    expect(result.model).toBe('gpt-4o');
    expect(result.decision.routed).toBe(false);

    // No routing decision to log for an explicit selection.
    expect(emitted).toHaveLength(0);
  });

  it('auto on a provider with no table entry (xAI) → frontier fallback (DEFAULT_MODEL)', () => {
    const { result } = runRoute({
      providerName: 'xAI',
      isModelUsable: () => true,
      task: { chatMode: 'discuss', lastUserMessage: 'why is the sky blue?' },
    });
    expect(result.model).toBe(DEFAULT_MODEL);
    expect(result.decision.routed).toBe(false);
  });

  it('auto + small model unusable → frontier fallback', () => {
    const { result } = runRoute({
      isModelUsable: (id) => id === ANTHROPIC_FRONTIER, // small id not usable
      task: { chatMode: 'discuss', lastUserMessage: 'why is the sky blue?' },
    });
    expect(result.model).toBe(ANTHROPIC_FRONTIER);
    expect(result.decision.routed).toBe(false);
  });

  it('kill-switch → no routing at all (keeps frontier for Auto)', () => {
    const { result } = runRoute({
      env: { MODEL_ROUTING_DISABLED: '1' },
      task: { chatMode: 'discuss', lastUserMessage: 'why is the sky blue?' },
    });
    expect(result.routingDisabled).toBe(true);
    expect(result.model).toBe(ANTHROPIC_FRONTIER);
    expect(result.decision.routed).toBe(false);
  });

  it("never lets the 'auto' sentinel escape — always a concrete id", () => {
    for (const task of [
      { chatMode: 'discuss', lastUserMessage: 'hi' },
      { chatMode: 'build', lastUserMessage: 'add a footer', contextFileCount: 1, planFirst: false },
      { chatMode: 'build', lastUserMessage: 'build a full app', contextFileCount: 0 },
    ]) {
      const { result } = runRoute({ task });
      expect(result.model).not.toBe(AUTO_MODEL);
      expect(result.model.length).toBeGreaterThan(0);
    }
  });

  it('telemetry emission never throws even if the sink throws', () => {
    expect(() =>
      resolveTurnModel(
        {
          selectedModel: AUTO_MODEL,
          providerName: 'Anthropic',
          isModelUsable: anthropicUsable,
          env: {},
          task: { chatMode: 'discuss', lastUserMessage: 'hi' },
        },
        () => {
          throw new Error('sink boom');
        },
      ),
    ).not.toThrow();
  });
});

describe('model routing — continuation consistency', () => {
  it('reuses the first turn’s concrete model across continuation segments (no mid-generation flip)', () => {
    // First segment: Auto + a simple edit resolves to the small model.
    const first = runRoute({
      task: { chatMode: 'build', lastUserMessage: 'change the header color', contextFileCount: 1, planFirst: false },
    }).result;
    expect(first.model).toBe(ANTHROPIC_SMALL);

    /*
     * The chat route threads this CONCRETE id into every continuation's
     * [Model:] prefix. Re-running with that concrete id (and a CONTINUE_PROMPT
     * that would classify as 'build') must keep the SAME model — guardrail #1
     * (explicit model → never routed) makes the continuation a no-op.
     */
    const continued = runRoute({
      selectedModel: first.model,
      task: {
        chatMode: 'build',
        lastUserMessage: 'Continue your prior response. IMPORTANT: Immediately continue from where you left off',
        contextFileCount: 1,
        planFirst: false,
      },
    }).result;

    expect(continued.model).toBe(ANTHROPIC_SMALL);
    expect(continued.decision.routed).toBe(false); // no re-route; explicit concrete id
  });

  it('reads the process-env kill-switch when no request env is supplied', () => {
    const prev = process.env.MODEL_ROUTING_DISABLED;
    process.env.MODEL_ROUTING_DISABLED = 'true';

    try {
      const result = resolveTurnModel(
        {
          selectedModel: AUTO_MODEL,
          providerName: 'Anthropic',
          isModelUsable: anthropicUsable,
          task: { chatMode: 'discuss', lastUserMessage: 'hi' },

          // no env → falls back to process.env
        },
        vi.fn(),
      );
      expect(result.routingDisabled).toBe(true);
      expect(result.model).toBe(ANTHROPIC_FRONTIER);
    } finally {
      if (prev === undefined) {
        delete process.env.MODEL_ROUTING_DISABLED;
      } else {
        process.env.MODEL_ROUTING_DISABLED = prev;
      }
    }
  });
});
