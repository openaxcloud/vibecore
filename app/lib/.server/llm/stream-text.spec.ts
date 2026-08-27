import type { Message } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { AUTO_MODEL } from './model-routing';
import {
  appendContextAsTrailingUserMessage,
  applyContextOptimizedHistoryWindow,
  DEFAULT_STREAM_MAX_RETRIES,
  fingerprintPrompt,
  getCompletionTokenLimit,
  isModelRoutingDisabled,
  probeStreamProvider,
  resolveStreamMaxRetries,
  resolveTurnModel,
  startProviderStream,
} from './stream-text';
import { DEFAULT_MODEL } from '~/utils/constants';

const ANTHROPIC_FRONTIER = 'claude-opus-5';
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

describe('startProviderStream', () => {
  it('does not run the unreceipted health probe for a canonical managed stream', async () => {
    const probe = vi.fn(async () => undefined);

    await probeStreamProvider({ skipProviderProbe: true, probe });

    expect(probe).not.toHaveBeenCalled();
  });

  it('preserves the health probe for non-canonical callers', async () => {
    const probe = vi.fn(async () => undefined);

    await probeStreamProvider({ probe });

    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('does not start the provider when the durable billing latch fails', async () => {
    const provider = vi.fn();

    await expect(
      startProviderStream({
        onProviderStart: async () => {
          throw new Error('durable latch unavailable');
        },
        stream: provider,
      }),
    ).rejects.toThrow('durable latch unavailable');
    expect(provider).not.toHaveBeenCalled();
  });

  it('starts exactly once and only after the durable latch resolves', async () => {
    const order: string[] = [];

    const result = await startProviderStream({
      onProviderStart: async () => {
        order.push('started');
      },
      stream: () => {
        order.push('provider');
        return 'stream';
      },
    });

    expect(result).toBe('stream');
    expect(order).toEqual(['started', 'provider']);
  });
});

describe('applyContextOptimizedHistoryWindow (anchored / append-only window)', () => {
  it('keeps the full recent conversation when no window is requested', () => {
    const messages = ['first user request', 'assistant response', 'follow-up request'];

    expect(applyContextOptimizedHistoryWindow(messages, 0)).toEqual(messages);
    expect(applyContextOptimizedHistoryWindow(messages)).toEqual(messages);
  });

  it('degenerates to the old sliding window when step ≤ 1 (keeps exactly the last N)', () => {
    const messages = ['m1', 'm2', 'm3', 'm4', 'm5'];
    expect(applyContextOptimizedHistoryWindow(messages, 2, 1)).toEqual(['m4', 'm5']);
  });

  it('keeps the WHOLE history until the surplus reaches a full step (drop quantized to 0)', () => {
    // recentWindow=2, step=5, total=6 → rawDrop=4 < step → drop 0 → keep all.
    const messages = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];
    expect(applyContextOptimizedHistoryWindow(messages, 2, 5)).toEqual(messages);
  });

  it('drops exactly one step once the surplus crosses the step boundary', () => {
    // recentWindow=2, step=5, total=7 → rawDrop=5 → drop 5 → keep last 2.
    const messages = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'];
    expect(applyContextOptimizedHistoryWindow(messages, 2, 5)).toEqual(['m6', 'm7']);
  });

  it('keeps message[0] BYTE-IDENTICAL while the conversation grows within a palier (the cache property)', () => {
    // recentWindow=2, step=5. Append one message per "turn"; the window start must not move.
    const base = Array.from({ length: 7 }, (_, i) => `m${i + 1}`); // total 7 → drop 5 → start = m6
    const firsts: string[] = [];

    for (let extra = 0; extra < 4; extra++) {
      const grown = [...base, ...Array.from({ length: extra }, (_, j) => `x${j + 1}`)]; // total 7..10
      const windowed = applyContextOptimizedHistoryWindow(grown, 2, 5);
      firsts.push(windowed[0]);
    }

    // total 7,8,9,10 → rawDrop 5,6,7,8 → all floor(/5)*5 = 5 → start pinned at m6 the whole palier.
    expect(firsts).toEqual(['m6', 'm6', 'm6', 'm6']);
  });

  it('advances the window start by exactly one step when the palier jumps', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `m${i + 1}`); // total 11 → rawDrop 9 → floor(9/5)*5=5 → start m6
    const twelve = Array.from({ length: 12 }, (_, i) => `m${i + 1}`); // total 12 → rawDrop 10 → floor(10/5)*5=10 → start m11
    expect(applyContextOptimizedHistoryWindow(eleven, 2, 5)[0]).toBe('m6');
    expect(applyContextOptimizedHistoryWindow(twelve, 2, 5)[0]).toBe('m11');
  });

  it('bounds the retained count to [recentWindow, recentWindow + step - 1] (budget guardrail)', () => {
    const step = 5;
    const recentWindow = 2;

    for (let total = 1; total <= 40; total++) {
      const messages = Array.from({ length: total }, (_, i) => `m${i + 1}`);
      const kept = applyContextOptimizedHistoryWindow(messages, recentWindow, step).length;
      expect(kept).toBeLessThanOrEqual(Math.min(total, recentWindow + step - 1));

      if (total > recentWindow) {
        expect(kept).toBeGreaterThanOrEqual(recentWindow);
      }
    }
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

describe('appendContextAsTrailingUserMessage (cache-max: strict append-only history)', () => {
  const user = (content: string, parts?: Message['parts']): Message =>
    ({ id: Math.random().toString(36).slice(2), role: 'user', content, ...(parts ? { parts } : {}) }) as Message;
  const assistant = (content: string): Message =>
    ({ id: Math.random().toString(36).slice(2), role: 'assistant', content }) as Message;

  it('carries the context in a SEPARATE trailing user message, leaving every real message byte-identical', () => {
    const history = [user('first'), assistant('a'), user('latest ask')];
    const out = appendContextAsTrailingUserMessage(history, 'CTX');

    // One extra message appended; the real turns are untouched (append-only).
    expect(out).toHaveLength(4);
    expect(out[0].content).toBe('first');
    expect(out[2].content).toBe('latest ask');

    // The volatile block lives ONLY in the throwaway trailing user message.
    expect(out[3].role).toBe('user');
    expect(out[3].content).toBe('CTX');
  });

  it('sets the block on BOTH content and parts (convertToCoreMessages reads whichever the message carries)', () => {
    const out = appendContextAsTrailingUserMessage([user('ask')], 'CTX');
    expect(out[1].content).toBe('CTX');
    expect(out[1].parts).toEqual([{ type: 'text', text: 'CTX' }]);
  });

  it('the pre-existing messages are the SAME object references (never re-rendered)', () => {
    const m0 = user('first');
    const m1 = assistant('a');
    const m2 = user('latest ask');
    const out = appendContextAsTrailingUserMessage([m0, m1, m2], 'CTX');
    expect(out[0]).toBe(m0);
    expect(out[1]).toBe(m1);
    expect(out[2]).toBe(m2);
  });

  it('is a no-op for an empty / whitespace-only context block (never adds a turn)', () => {
    const input = [user('ask')];
    expect(appendContextAsTrailingUserMessage(input, '')).toBe(input);
    expect(appendContextAsTrailingUserMessage(input, '   \n ')).toBe(input);
  });

  it('does not mutate the input array or the original message objects', () => {
    const original = user('ask');
    const input = [original];
    const out = appendContextAsTrailingUserMessage(input, 'CTX');
    expect(out).not.toBe(input);
    expect(input).toHaveLength(1);
    expect(original.content).toBe('ask');
  });

  it('appends a trailing turn even with no prior user message (context still reaches the model)', () => {
    const input = [assistant('only assistant')];
    const out = appendContextAsTrailingUserMessage(input, 'CTX');
    expect(out).toHaveLength(2);
    expect(out[1].role).toBe('user');
    expect(out[1].content).toBe('CTX');
  });

  /*
   * The bug this fix targets: with the old append-to-last-user-message, turn 1's
   * first user message was cached WITH the volatile block, then replayed CLEAN on
   * turn 2 — so OpenAI's common-prefix cache collapsed to the system head. Here we
   * simulate two consecutive turns and assert the cacheable prefix (every message
   * except the throwaway trailing one) is strictly append-only: turn 1's prefix is
   * a byte-identical FRONT of turn 2's prefix, so the shared prefix grows.
   */
  it('keeps the cacheable prefix strictly append-only across two consecutive turns', () => {
    // Client always replays CLEAN history (the volatile block is server-side only).
    const u1 = user('In one sentence, which build tool does this project use?');
    const turn1 = appendContextAsTrailingUserMessage([u1], 'VOLATILE-TURN-1');

    const a1 = assistant('It uses Vite.');
    const u2 = user('In one sentence, what does the README say?');
    const turn2 = appendContextAsTrailingUserMessage([u1, a1, u2], 'VOLATILE-TURN-2-DIFFERENT');

    // Cacheable prefix = everything except the last (per-turn-variable) message.
    const prefix1 = turn1.slice(0, -1);
    const prefix2 = turn2.slice(0, -1);

    // Turn 1's prefix is a byte-identical front of turn 2's prefix (append-only growth).
    expect(JSON.stringify(prefix2.slice(0, prefix1.length))).toBe(JSON.stringify(prefix1));

    // Specifically: u1 is IDENTICAL across turns — no volatile ever leaked onto it.
    expect(prefix1[0].content).toBe('In one sentence, which build tool does this project use?');
    expect(prefix2[0].content).toBe('In one sentence, which build tool does this project use?');

    // And turn 2's prefix genuinely GREW (system-equivalent + full prior exchange is now cacheable).
    expect(prefix2.length).toBeGreaterThan(prefix1.length);
  });
});
