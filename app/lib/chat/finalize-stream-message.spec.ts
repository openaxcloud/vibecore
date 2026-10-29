import type { Message } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { finalizeStreamMessage, processStreamSnapshot } from './finalize-stream-message';
import { createSampler } from '~/utils/sampler';

const complete: Message = {
  id: 'current-answer',
  role: 'assistant',
  content:
    '<boltArtifact id="fixture"><boltAction type="file" filePath="src/App.tsx">export default () => null;</boltAction></boltArtifact>',
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

function fixture() {
  const parseMessages = vi.fn();
  const finishFileActions = vi.fn();
  const state = { current: true, aborted: false };

  const options: Parameters<typeof processStreamSnapshot>[0] = {
    messages: [complete],
    initialMessages: [],
    isLoading: false,
    isCurrent: () => state.current,
    isAborted: () => state.aborted,
    parseMessages,
    finishFileActions,
  };

  const sample = createSampler(processStreamSnapshot, 50);

  return { options, state, sample, parseMessages, finishFileActions };
}

describe('sampled stream finalization boundaries', () => {
  it.each(['navigation', 'unmount'])('drops a snapshot invalidated by %s before its trailing sample', async () => {
    const { options, state, sample, parseMessages, finishFileActions } = fixture();
    sample(options);
    await vi.advanceTimersByTimeAsync(49);
    expect(parseMessages).not.toHaveBeenCalled();
    state.current = false;
    await vi.advanceTimersByTimeAsync(1);
    expect(parseMessages).not.toHaveBeenCalled();
    expect(finishFileActions).not.toHaveBeenCalled();
  });

  it('Stop before a late complete artifact prevents both parsing and finalization', async () => {
    const { options, state, sample, parseMessages, finishFileActions } = fixture();
    sample({ ...options, isLoading: true, messages: [{ ...complete, content: '<boltArtifact' }] });
    await vi.advanceTimersByTimeAsync(25);
    state.aborted = true;
    sample(options);
    await vi.advanceTimersByTimeAsync(25);
    expect(parseMessages).not.toHaveBeenCalled();
    expect(finishFileActions).not.toHaveBeenCalled();
  });

  it('parses active final bytes as streaming before finish, then parses the terminal snapshot', async () => {
    const { options, sample, parseMessages, finishFileActions } = fixture();
    const order: string[] = [];
    parseMessages.mockImplementation((_messages, loading) => order.push(`parse:${loading}`));
    finishFileActions.mockImplementation(() => order.push('finish'));
    sample({ ...options, isLoading: true, messages: [{ ...complete, content: '<boltArtifact' }] });
    await vi.advanceTimersByTimeAsync(25);
    sample(options);
    await vi.advanceTimersByTimeAsync(25);
    expect(order).toEqual(['parse:true', 'finish', 'parse:false']);
    expect(parseMessages.mock.calls).toEqual([
      [[complete], true],
      [[complete], false],
    ]);
    expect(finishFileActions).toHaveBeenCalledExactlyOnceWith(complete.id);
  });

  it('parses historical initial messages without finalizing them as new output', async () => {
    const { options, sample, parseMessages, finishFileActions } = fixture();
    sample({ ...options, initialMessages: [complete] });
    await vi.advanceTimersByTimeAsync(50);
    expect(parseMessages).toHaveBeenCalledExactlyOnceWith([complete], false);
    expect(finishFileActions).not.toHaveBeenCalled();
  });

  it('restores only project B history when the global abort flag survives project A', async () => {
    const { options, state, parseMessages, finishFileActions } = fixture();
    const historyB: Message[] = [{ id: 'history-B', role: 'assistant', content: 'Saved project B history' }];
    const lateA: Message = { ...complete, id: 'late-A' };
    state.aborted = true;

    const processed = vi.fn(processStreamSnapshot);
    const sample = createSampler(processed, 50);
    sample({ ...options, initialMessages: historyB, messages: [...historyB, lateA] });
    await vi.advanceTimersByTimeAsync(50);
    expect(processed).toHaveReturnedWith(false);
    expect(parseMessages).toHaveBeenCalledExactlyOnceWith(historyB, false);
    expect(parseMessages.mock.calls[0][0]).not.toContain(lateA);
    expect(finishFileActions).not.toHaveBeenCalled();
  });

  it('does not inject an absent late callback message into a different transcript', () => {
    const { parseMessages, finishFileActions } = fixture();
    const transcript: Message[] = [{ id: 'other-project', role: 'user', content: 'Other project' }];
    finalizeStreamMessage(complete, transcript, parseMessages, finishFileActions);
    expect(parseMessages).not.toHaveBeenCalled();
    expect(finishFileActions).not.toHaveBeenCalled();
    expect(transcript).toHaveLength(1);
  });

  it('replaces the partial matching message with final bytes without mutating the old transcript', () => {
    const { parseMessages, finishFileActions } = fixture();
    const partial = { ...complete, content: '<boltArtifact' };
    const transcript = [partial];
    finalizeStreamMessage(complete, transcript, parseMessages, finishFileActions);
    expect(parseMessages).toHaveBeenCalledExactlyOnceWith([complete], true);
    expect(finishFileActions).toHaveBeenCalledExactlyOnceWith(complete.id);
    expect(transcript[0].content).toBe('<boltArtifact');
  });
});
