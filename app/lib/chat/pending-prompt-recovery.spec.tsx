// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useChatTerminalRecovery, type PendingChatGeneration } from '~/components/chat/useChatTerminalRecovery';
import { canAutomaticallyReplayPrompt } from '~/lib/chat/pending-prompt-budget';
import { noterLeTourEnCours, tourInterrompuAReprendre } from '~/lib/chat/tour-en-cours';
import { decidePendingPromptReplay, resolvePendingPrompt } from '~/lib/runtime/pending-generation';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});
it('an incomplete turn with one file must not become an automatic paid replay after reopen', async () => {
  vi.useFakeTimers();

  const prompt = { id: 'fixture', prompt: 'Synthetic app', createdAt: '2026-10-30T00:00:00Z' };
  const memory = { pendingPrompt: prompt as typeof prompt | null };

  const pending = {
    current: { promptId: prompt.id, pendingPrompt: prompt, baselineFileCount: 0 } as PendingChatGeneration | null,
  };
  const hook = renderHook(() =>
    useChatTerminalRecovery({
      projectId: 'synthetic',
      generation: () => 0,
      pendingGeneration: pending,
      countFiles: () => 1,
      consume: () => {
        memory.pendingPrompt = null;
      },
    }),
  );
  noterLeTourEnCours('synthetic');
  act(() => {
    hook.result.current.begin();
    hook.result.current.finish({ id: 'assistant', role: 'assistant', content: 'partial file' }, 'length');
    vi.advanceTimersByTime(1500);
  });
  expect(memory.pendingPrompt).not.toBeNull();
  expect(tourInterrompuAReprendre('synthetic')).toBe(true);
  hook.unmount();

  const files = { '/home/project/main.js': { type: 'file' as const, content: 'console.log(1)', isBinary: false } };
  const decision = decidePendingPromptReplay(files, true);
  const transport = vi.fn(async () => new Response(JSON.stringify({ bounded: false }), { status: 200 }));
  const budgetAllows = await canAutomaticallyReplayPrompt('synthetic', transport as typeof fetch);
  const automaticallyEligible = Boolean(memory.pendingPrompt) && decision === 'replay' && budgetAllows;
  expect(resolvePendingPrompt({ baselineFileCount: 0, finalFileCount: 1, errored: false })).toBe('clear');
  expect(automaticallyEligible).toBe(false);
});

describe('interrupted prompt replay gate', () => {
  it('does not query the budget or dispatch when this project is already interrupted', async () => {
    noterLeTourEnCours('A');

    const transport = vi.fn<typeof fetch>(async () => Response.json({ bounded: false }));
    expect(await canAutomaticallyReplayPrompt('A', transport)).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });
  it.each(['fetch', 'json'] as const)('rechecks a marker appearing during %s', async (stage) => {
    let resolveFetch!: (response: Response) => void;
    let resolveJson!: (body: unknown) => void;

    const response = Response.json({ bounded: false });

    const parse = vi.spyOn(response, 'json').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveJson = resolve;
        }),
    );
    const transport = vi.fn<typeof fetch>(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const allowed = canAutomaticallyReplayPrompt('A', transport);

    if (stage === 'fetch') {
      noterLeTourEnCours('A');
    }

    resolveFetch(response);
    await Promise.resolve();
    expect(parse).toHaveBeenCalledOnce();

    if (stage === 'json') {
      noterLeTourEnCours('A');
    }

    resolveJson({ bounded: false });
    expect(await allowed).toBe(false);
    expect(transport).toHaveBeenCalledOnce();
  });
  it('keeps legitimate initial generation available and scopes interruption to its project', async () => {
    noterLeTourEnCours('other');

    const transport = vi.fn<typeof fetch>(async () => Response.json({ bounded: false }));
    expect(await canAutomaticallyReplayPrompt('new-project', transport)).toBe(true);
    expect(transport).toHaveBeenCalledOnce();
  });
});
