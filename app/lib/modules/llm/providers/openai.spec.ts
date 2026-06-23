import { describe, expect, it, vi } from 'vitest';

/*
 * `openai.ts` -> `base-provider.ts` -> `manager.ts` -> `registry.ts` -> every
 * provider -> `base-provider.ts` is a circular import. During a unit test that
 * only exercises the pure id heuristics, evaluating the registry is both
 * unnecessary and (because of the cycle) leaves BaseProvider undefined at the
 * point a sibling provider tries to extend it. Stubbing the manager severs the
 * cycle so the real exported helpers under test load cleanly.
 */
vi.mock('../manager', () => ({ LLMManager: class {} }));

const { inferOpenAIContextWindow, inferOpenAIMaxCompletionTokens, isSelectableOpenAIChatModel } = await import(
  './openai'
);

describe('isSelectableOpenAIChatModel', () => {
  it('accepts gpt- and chatgpt- chat models', () => {
    expect(isSelectableOpenAIChatModel('gpt-4o')).toBe(true);
    expect(isSelectableOpenAIChatModel('gpt-4.1-mini')).toBe(true);
    expect(isSelectableOpenAIChatModel('chatgpt-4o-latest')).toBe(true);
    expect(isSelectableOpenAIChatModel('gpt-5')).toBe(true);
    expect(isSelectableOpenAIChatModel('gpt-5-mini')).toBe(true);
  });

  it('accepts o1/o3/o4 reasoning families', () => {
    expect(isSelectableOpenAIChatModel('o1')).toBe(true);
    expect(isSelectableOpenAIChatModel('o1-mini')).toBe(true);
    expect(isSelectableOpenAIChatModel('o3')).toBe(true);
    expect(isSelectableOpenAIChatModel('o3-mini')).toBe(true);
    expect(isSelectableOpenAIChatModel('o4-mini')).toBe(true);
  });

  it('rejects non-chat o-prefixed models like omni-moderation-latest (bug 2)', () => {
    expect(isSelectableOpenAIChatModel('omni-moderation-latest')).toBe(false);
  });

  it('rejects other non-chat product families', () => {
    expect(isSelectableOpenAIChatModel('text-embedding-3-large')).toBe(false);
    expect(isSelectableOpenAIChatModel('tts-1')).toBe(false);
    expect(isSelectableOpenAIChatModel('whisper-1')).toBe(false);
    expect(isSelectableOpenAIChatModel('dall-e-3')).toBe(false);
    expect(isSelectableOpenAIChatModel('gpt-4o-transcribe')).toBe(false);
    expect(isSelectableOpenAIChatModel('gpt-4o-audio-preview')).toBe(false);
    expect(isSelectableOpenAIChatModel('gpt-4o-realtime-preview')).toBe(false);
  });

  it('rejects undefined/empty ids', () => {
    expect(isSelectableOpenAIChatModel(undefined)).toBe(false);
    expect(isSelectableOpenAIChatModel('')).toBe(false);
  });
});

describe('inferOpenAIContextWindow', () => {
  it('gives o3/o4/o1 reasoning models a 200k window (bug 1)', () => {
    expect(inferOpenAIContextWindow('o3')).toBe(200000);
    expect(inferOpenAIContextWindow('o3-mini')).toBe(200000);
    expect(inferOpenAIContextWindow('o4-mini')).toBe(200000);
    expect(inferOpenAIContextWindow('o1')).toBe(200000);
  });

  it('keeps the context window >= the completion budget for o3/o4 (bug 1 invariant)', () => {
    for (const id of ['o3', 'o3-mini', 'o4-mini', 'o1', 'o1-mini', 'o1-preview']) {
      expect(inferOpenAIContextWindow(id)).toBeGreaterThanOrEqual(inferOpenAIMaxCompletionTokens(id));
    }
  });

  it('classifies gpt families correctly', () => {
    expect(inferOpenAIContextWindow('gpt-4.1')).toBe(1047576);
    expect(inferOpenAIContextWindow('gpt-4.5-preview')).toBe(1047576);
    expect(inferOpenAIContextWindow('gpt-4o')).toBe(128000);
    expect(inferOpenAIContextWindow('gpt-4-turbo')).toBe(128000);
    expect(inferOpenAIContextWindow('gpt-4')).toBe(8192);
    expect(inferOpenAIContextWindow('gpt-3.5-turbo')).toBe(16385);
  });

  it('gives gpt-5 family a large window instead of the 32k default (bug 1)', () => {
    expect(inferOpenAIContextWindow('gpt-5')).toBe(400000);
    expect(inferOpenAIContextWindow('gpt-5-mini')).toBe(400000);
    expect(inferOpenAIContextWindow('gpt-5-nano')).toBe(400000);
  });

  it('keeps the gpt-5 context window >= its completion budget (bug 1 invariant)', () => {
    for (const id of ['gpt-5', 'gpt-5-mini', 'gpt-5-nano']) {
      expect(inferOpenAIContextWindow(id)).toBeGreaterThanOrEqual(inferOpenAIMaxCompletionTokens(id));
    }
  });

  it('honours an explicit context_length when present', () => {
    expect(inferOpenAIContextWindow('o3', 12345)).toBe(12345);
    expect(inferOpenAIContextWindow('gpt-4', 99999)).toBe(99999);
  });

  it('ignores a non-positive context_length and falls back to the heuristic', () => {
    expect(inferOpenAIContextWindow('gpt-4o', 0)).toBe(128000);
    expect(inferOpenAIContextWindow('gpt-4o', -1)).toBe(128000);
  });

  it('falls back to 32k for unknown ids', () => {
    expect(inferOpenAIContextWindow('mystery-model')).toBe(32000);
  });
});

describe('inferOpenAIMaxCompletionTokens', () => {
  it('assigns o-series budgets', () => {
    expect(inferOpenAIMaxCompletionTokens('o1-preview')).toBe(32000);
    expect(inferOpenAIMaxCompletionTokens('o1-mini')).toBe(65000);
    expect(inferOpenAIMaxCompletionTokens('o1')).toBe(32000);
    expect(inferOpenAIMaxCompletionTokens('o3-mini')).toBe(100000);
    expect(inferOpenAIMaxCompletionTokens('o4-mini')).toBe(100000);
  });

  it('assigns gpt budgets', () => {
    expect(inferOpenAIMaxCompletionTokens('gpt-4.1')).toBe(32768);
    expect(inferOpenAIMaxCompletionTokens('gpt-4o')).toBe(16384);
    expect(inferOpenAIMaxCompletionTokens('gpt-4')).toBe(8192);
    expect(inferOpenAIMaxCompletionTokens('gpt-3.5-turbo')).toBe(4096);
  });

  it('assigns gpt-5 a 128k budget instead of the 4096 default (bug 1)', () => {
    expect(inferOpenAIMaxCompletionTokens('gpt-5')).toBe(128000);
    expect(inferOpenAIMaxCompletionTokens('gpt-5-mini')).toBe(128000);
  });
});
