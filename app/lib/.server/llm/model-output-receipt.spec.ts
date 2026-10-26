import { describe, expect, it, vi } from 'vitest';
import { createModelOutputObserver } from './model-output-receipt';

describe('model output receipt', () => {
  it('ignores non-text and empty text, then reports only the first nonempty delta', async () => {
    const onOutput = vi.fn();
    const observe = createModelOutputObserver({ provider: 'configured-provider', model: 'configured-model', onOutput });
    expect(onOutput).not.toHaveBeenCalled();
    await observe({ chunk: { type: 'reasoning', textDelta: 'thinking' } });
    await observe({ chunk: { type: 'text-delta', textDelta: '' } });
    expect(onOutput).not.toHaveBeenCalled();
    await observe({ chunk: { type: 'text-delta', textDelta: 'first' } });
    await observe({ chunk: { type: 'text-delta', textDelta: 'second' } });
    expect(onOutput).toHaveBeenCalledExactlyOnceWith({
      provider: 'configured-provider',
      model: 'configured-model',
      evidence: 'text-delta',
    });
  });

  it('awaits the existing callback and preserves its failure', async () => {
    const onOutput = vi.fn();
    const error = new Error('caller callback failed');

    const onChunk = vi.fn(async () => {
      throw error;
    });

    const observe = createModelOutputObserver({ provider: 'p', model: 'm', onOutput, onChunk });
    const event = { chunk: { type: 'text-delta' as const, textDelta: 'text' } };
    await expect(observe(event)).rejects.toBe(error);
    expect(onChunk).toHaveBeenCalledWith(event);
    expect(onOutput).not.toHaveBeenCalled();
  });

  it('does not deduplicate distinct invocations sharing the same message ID', async () => {
    const onOutput = vi.fn();

    for (const model of ['first', 'continuation']) {
      const observe = createModelOutputObserver({ provider: 'p', model, messageId: 'message', onOutput });
      await observe({ chunk: { type: 'text-delta', textDelta: 'text' } });
    }
    expect(onOutput.mock.calls.map(([receipt]) => receipt.model)).toEqual(['first', 'continuation']);
    expect(onOutput.mock.calls.every(([receipt]) => receipt.messageId === 'message')).toBe(true);
  });
  it('ignores a buffered text delta after cancellation while preserving the caller callback', async () => {
    const controller = new AbortController();
    const onOutput = vi.fn();
    const onChunk = vi.fn();

    const observe = createModelOutputObserver({
      provider: 'p',
      model: 'm',
      onOutput,
      onChunk,
      abortSignal: controller.signal,
    });
    controller.abort();
    await observe({ chunk: { type: 'text-delta', textDelta: 'late buffered text' } });
    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onOutput).not.toHaveBeenCalled();
  });
});
