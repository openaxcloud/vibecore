// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import type { Message } from 'ai';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatTerminalRecovery, type PendingChatGeneration } from './useChatTerminalRecovery';
import { noterLeTourEnCours, tourInterrompuAReprendre } from '~/lib/chat/tour-en-cours';

const message = (status?: 'complete' | 'incomplete' | 'error', finishReason = 'stop'): Message => ({
  id: 'assistant-fixture',
  role: 'assistant',
  content: 'Synthetic fixture',
  annotations: status
    ? [
        {
          type: 'streamTerminal',
          status,
          finishReason,
          reason: status === 'complete' ? 'finished' : 'unknown-finish',
          segments: 1,
          fileActions: 1,
          openActions: 0,
          openArtifacts: 0,
        },
      ]
    : undefined,
});

function setup() {
  let generation = 0;

  const pending = {
    current: {
      promptId: 'initial',
      baselineFileCount: 1,
      pendingPrompt: { id: 'initial', prompt: 'Synthetic app', createdAt: '2026-10-30T00:00:00Z' },
    } as PendingChatGeneration | null,
  };

  const consume = vi.fn();

  const hook = renderHook(
    ({ projectId }) =>
      useChatTerminalRecovery({
        projectId,
        generation: () => generation,
        pendingGeneration: pending,
        countFiles: () => 2,
        consume,
      }),
    { initialProps: { projectId: 'A' } },
  );
  noterLeTourEnCours('A');
  act(() => hook.result.current.begin());

  return {
    hook,
    pending,
    consume,
    changeGeneration: () => {
      generation += 1;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('terminal recovery with the real React hook', () => {
  it.each(['length', 'error', 'unknown', 'tool-calls', 'content-filter', 'other'])(
    'keeps the prompt and interrupted marker after %s even when a file exists',
    (reason) => {
      const { hook, consume } = setup();
      act(() => {
        hook.result.current.finish(message(undefined), reason);
        vi.advanceTimersByTime(1500);
      });
      expect(tourInterrompuAReprendre('A')).toBe(true);
      expect(consume).not.toHaveBeenCalled();
    },
  );
  it('does not treat a legacy stop without a terminal annotation as app completion', () => {
    const { hook, consume } = setup();
    act(() => {
      hook.result.current.finish(message(), 'stop');
      vi.advanceTimersByTime(1500);
    });
    expect(tourInterrompuAReprendre('A')).toBe(true);
    expect(consume).not.toHaveBeenCalled();
  });
  it('keeps recovery after an incomplete annotation despite SDK stop', () => {
    const { hook, consume } = setup();
    act(() => {
      hook.result.current.finish(message('incomplete'), 'stop');
      vi.advanceTimersByTime(1500);
    });
    expect(tourInterrompuAReprendre('A')).toBe(true);
    expect(consume).not.toHaveBeenCalled();
  });
  it('clears recovery only for a confirmed complete turn with a new file', () => {
    const { hook, consume } = setup();
    act(() => {
      hook.result.current.finish(message('complete'), 'stop');
      vi.advanceTimersByTime(1500);
    });
    expect(tourInterrompuAReprendre('A')).toBe(false);
    expect(consume).toHaveBeenCalledOnce();
  });
  it.each(['navigate', 'clear', 'unmount', 'stop'])('cannot consume a pending prompt after %s', (action) => {
    const { hook, consume, changeGeneration } = setup();
    act(() => hook.result.current.finish(message('complete'), 'stop'));

    if (action === 'navigate') {
      hook.rerender({ projectId: 'B' });
    }

    if (action === 'clear') {
      changeGeneration();
    }

    if (action === 'unmount') {
      hook.unmount();
    }

    if (action === 'stop') {
      act(() => hook.result.current.cancel());
    }

    act(() => vi.advanceTimersByTime(1500));
    expect(consume).not.toHaveBeenCalled();
  });
  it('ignores a terminal callback arriving after Stop', () => {
    const { hook, consume } = setup();
    act(() => {
      hook.result.current.cancel();
      hook.result.current.finish(message('complete'), 'stop');
      vi.advanceTimersByTime(1500);
    });
    expect(consume).not.toHaveBeenCalled();
  });
});

// Real AI SDK decoder: only its HTTP boundary is synthetic, with no model/provider call.
describe('actual useChat stream terminal integration', () => {
  let sequence = 0;
  it.each([
    ['EOF', undefined, undefined, true],
    ['length', 'length', 'incomplete', true],
    ['error', 'error', 'error', true],
    ['stop without receipt', 'stop', undefined, true],
    ['confirmed stop', 'stop', 'complete', false],
  ] as const)('%s preserves truthful recovery', async (_name, finishReason, status, interrupted) => {
    const { useChat } = await import('@ai-sdk/react');
    const consume = vi.fn();

    const pending = {
      current: {
        promptId: 'sdk',
        baselineFileCount: 1,
        pendingPrompt: { id: 'sdk', prompt: 'fixture', createdAt: '2026-10-30T00:00:00Z' },
      } as PendingChatGeneration | null,
    };
    const wire =
      '0:"Synthetic file response"\n' +
      (status ? `8:${JSON.stringify(message(status, finishReason).annotations)}\n` : '') +
      (finishReason ? `d:${JSON.stringify({ finishReason, usage: { promptTokens: 1, completionTokens: 1 } })}\n` : '');
    const fetchFixture = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(wire));
              controller.close();
            },
          }),
          { headers: { 'content-type': 'text/plain; charset=utf-8', 'x-vercel-ai-data-stream': 'v1' } },
        ),
    );

    const sdkId = `terminal-sdk-${++sequence}`;

    const hook = renderHook(() => {
      const recovery = useChatTerminalRecovery({
        projectId: 'A',
        generation: () => 0,
        pendingGeneration: pending,
        countFiles: () => 2,
        consume,
      });
      const chat = useChat({
        id: sdkId,
        fetch: fetchFixture,
        experimental_prepareRequestBody: (body) => {
          recovery.begin();
          return { messages: body.messages };
        },
        onFinish: (response, details) => {
          recovery.finish(response, details.finishReason);
        },
        onError: () => {
          recovery.fail();
        },
      });

      return { chat, recovery };
    });
    noterLeTourEnCours('A');
    await act(async () => {
      await hook.result.current.chat.append({ role: 'user', content: 'Synthetic test only' });
    });
    act(() => vi.advanceTimersByTime(1500));
    expect(fetchFixture).toHaveBeenCalledOnce();
    expect(tourInterrompuAReprendre('A')).toBe(interrupted);
    expect(consume).toHaveBeenCalledTimes(interrupted ? 0 : 1);
  });
});

describe('request ownership', () => {
  it('does not confirm either of two dispatches using indistinguishable callbacks', () => {
    const { hook, consume } = setup();
    act(() => {
      hook.result.current.begin();
      hook.result.current.finish(message('complete'), 'stop');
      vi.advanceTimersByTime(1500);
    });
    expect(tourInterrompuAReprendre('A')).toBe(true);
    expect(consume).not.toHaveBeenCalled();
  });

  it.each([
    ['A', 'finish'],
    ['B', 'finish'],
    ['A', 'error'],
    ['B', 'error'],
  ] as const)('ignores an old SDK callback in project %s (%s)', async (nextProject, lateOutcome) => {
    const { useChat } = await import('@ai-sdk/react');
    const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
    const consume = vi.fn();
    const errors = vi.fn();
    const pending = { current: null as PendingChatGeneration | null };

    const fixtureFetch = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controllers.push(controller);
            },
          }),
          { headers: { 'x-vercel-ai-data-stream': 'v1' } },
        ),
    );
    const hook = renderHook(
      ({ projectId }) => {
        const recovery = useChatTerminalRecovery({
          projectId,
          generation: () => 0,
          pendingGeneration: pending,
          countFiles: () => 2,
          consume,
        });
        const chat = useChat({
          id: `owned-${nextProject}-${lateOutcome}-${projectId}`,
          fetch: fixtureFetch,
          experimental_prepareRequestBody: (body) => {
            recovery.begin();
            return { messages: body.messages };
          },
          onFinish: (response, details) => {
            recovery.finish(response, details.finishReason);
          },
          onError: () => {
            if (recovery.fail()) {
              errors();
            }
          },
        });

        return { chat, recovery };
      },
      { initialProps: { projectId: 'A' } },
    );

    let oldRequest!: ReturnType<typeof hook.result.current.chat.append>;
    await act(async () => {
      oldRequest = hook.result.current.chat.append({ role: 'user', content: 'old' });
      await Promise.resolve();
    });
    hook.rerender({ projectId: nextProject });
    noterLeTourEnCours(nextProject);
    pending.current = {
      promptId: 'new',
      baselineFileCount: 1,
      pendingPrompt: { id: 'new', prompt: 'new fixture', createdAt: '2026-10-30T00:00:00Z' },
    };

    let newRequest!: ReturnType<typeof hook.result.current.chat.append>;
    await act(async () => {
      newRequest = hook.result.current.chat.append({ role: 'user', content: 'new' });
      await Promise.resolve();
    });
    expect(controllers).toHaveLength(2);

    const completeWire = `0:"fixture"\n8:${JSON.stringify(message('complete').annotations)}\nd:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}\n`;
    await act(async () => {
      if (lateOutcome === 'error') {
        controllers[0].error(new Error('synthetic late failure'));
      } else {
        controllers[0].enqueue(new TextEncoder().encode(completeWire));
        controllers[0].close();
      }

      await oldRequest;
    });
    act(() => vi.advanceTimersByTime(1500));
    expect(tourInterrompuAReprendre(nextProject)).toBe(true);
    expect(consume).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    await act(async () => {
      controllers[1].enqueue(new TextEncoder().encode(completeWire));
      controllers[1].close();
      await newRequest;
    });
    act(() => vi.advanceTimersByTime(1500));
    expect(tourInterrompuAReprendre(nextProject)).toBe(false);
    expect(consume).toHaveBeenCalledOnce();
    expect(consume.mock.calls[0][0]).toBe(nextProject);
  });
});

describe('SDK dispatch owns loading after template preparation', () => {
  it('releases synthetic loading at dispatch and settles an ambiguous same-handle pair without clearing recovery', async () => {
    const { useChat } = await import('@ai-sdk/react');
    const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
    const consume = vi.fn();
    const pending = { current: null as PendingChatGeneration | null };

    const fixtureFetch = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controllers.push(controller);
            },
          }),
          { headers: { 'x-vercel-ai-data-stream': 'v1' } },
        ),
    );
    const hook = renderHook(() => {
      const [fakeLoading, setFakeLoading] = useState(true);

      const recovery = useChatTerminalRecovery({
        projectId: 'loading-fixture',
        generation: () => 0,
        pendingGeneration: pending,
        countFiles: () => 2,
        consume,
      });
      const chat = useChat({
        id: 'same-handle-loading',
        fetch: fixtureFetch,
        experimental_prepareRequestBody: (body) => {
          recovery.begin();
          setFakeLoading(false);

          return { messages: body.messages };
        },
        onFinish: (response, details) => {
          recovery.finish(response, details.finishReason);
        },
        onError: () => {
          recovery.fail();
        },
      });

      return { chat, fakeLoading };
    });
    expect(hook.result.current.fakeLoading).toBe(true);

    const appendFromSameRender = hook.result.current.chat.append;
    noterLeTourEnCours('loading-fixture');

    let first!: ReturnType<typeof appendFromSameRender>;
    let second!: ReturnType<typeof appendFromSameRender>;
    await act(async () => {
      first = appendFromSameRender({ role: 'user', content: 'first' });
      second = appendFromSameRender({ role: 'user', content: 'second' });
      await Promise.resolve();
    });
    expect(controllers).toHaveLength(2);
    expect(hook.result.current.fakeLoading).toBe(false);
    expect(hook.result.current.chat.isLoading).toBe(true);

    const wire = `0:"fixture"\n8:${JSON.stringify(message('complete').annotations)}\nd:{"finishReason":"stop"}\n`;
    await act(async () => {
      controllers.forEach((controller) => {
        controller.enqueue(new TextEncoder().encode(wire));
        controller.close();
      });
      await Promise.all([first, second]);
    });
    expect(hook.result.current.fakeLoading).toBe(false);
    expect(hook.result.current.chat.isLoading).toBe(false);
    expect(tourInterrompuAReprendre('loading-fixture')).toBe(true);
    expect(consume).not.toHaveBeenCalled();
    expect(fixtureFetch).toHaveBeenCalledTimes(2);
  });
});
