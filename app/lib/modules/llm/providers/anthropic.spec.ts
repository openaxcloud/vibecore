import { describe, expect, it, vi } from 'vitest';

/*
 * `anthropic.ts` -> `base-provider.ts` -> `manager.ts` -> `registry.ts` -> every
 * provider -> `base-provider.ts` is a circular import. During a unit test that
 * only exercises the pure label helper, evaluating the registry is both
 * unnecessary and (because of the cycle) leaves BaseProvider undefined at the
 * point a sibling provider tries to extend it. Stubbing the manager severs the
 * cycle so the real exported helper under test loads cleanly.
 */
vi.mock('../manager', () => ({ LLMManager: class {} }));

const { buildAnthropicModelLabel } = await import('./anthropic');

describe('buildAnthropicModelLabel', () => {
  it('uses display_name when present', () => {
    expect(buildAnthropicModelLabel({ display_name: 'Claude Opus 4.8', id: 'claude-opus-4-8' }, 1_000_000)).toBe(
      'Claude Opus 4.8 (1000k context)',
    );
  });

  it('falls back to the model id when display_name is missing', () => {
    expect(buildAnthropicModelLabel({ id: 'claude-opus-4-8' }, 200000)).toBe('claude-opus-4-8 (200k context)');
  });

  it('falls back to the model id when display_name is null', () => {
    expect(buildAnthropicModelLabel({ display_name: null, id: 'claude-future-1' }, 200000)).toBe(
      'claude-future-1 (200k context)',
    );
  });

  it('never renders a literal "undefined" label', () => {
    const label = buildAnthropicModelLabel({ id: 'claude-future-1' }, 200000);
    expect(label).not.toContain('undefined');
  });
});
