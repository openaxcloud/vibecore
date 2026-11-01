import { createHash } from 'node:crypto';

// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('~/lib/hooks/useMessageParser', () => ({ rejouerLeMessage: vi.fn() }));
vi.mock('~/lib/stores/workbench', () => ({ workbenchStore: { autoriserLaReprise: vi.fn() } }));
import { projectAiTranscriptMessages } from '~/components/chat/project-ai-transcript-messages';
import { projectAiMessagesToChatMessages } from '~/components/chat/projectAiTranscript';
import { noterLeTourEnCours, tourInterrompuAReprendre } from '~/lib/chat/tour-en-cours';
import { useRattrapageALaReprise } from '~/lib/hooks/useRattrapageALaReprise';
import { createStreamTerminal, latestStreamTerminal } from '~/lib/runtime/stream-terminal';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  localStorage.clear();
});
it('server fallback loses a valid terminal receipt through actual client wire adapters', () => {
  const receipt = createStreamTerminal({
    finishReason: 'stop',
    content: 'Complete',
    modeConstruction: false,
    fichiersRefuses: false,
    segments: 1,
    fileActions: 0,
    messageId: 'aimsg_a',
  });
  const original = {
    id: 'aimsg_a',
    role: 'assistant' as const,
    content: 'Complete',
    annotations: [{ ...receipt, contentSha256: createHash('sha256').update('Complete').digest('hex') }],
  };
  expect(latestStreamTerminal(original.annotations)).toMatchObject({ status: 'complete' });

  const wire = projectAiTranscriptMessages([original]);
  const restored = projectAiMessagesToChatMessages(wire.map((m) => ({ ...m, id: m.clientId })));
  expect(restored[0].content).toBe('Complete');
  expect(latestStreamTerminal(restored[0].annotations)).toMatchObject({ status: 'complete' });

  const legacy = projectAiMessagesToChatMessages([
    { id: 'aimsg_a', role: 'assistant', content: 'Complete', terminalReceipt: receipt },
  ]);
  expect(latestStreamTerminal(legacy[0].annotations)).toBeUndefined();
});
it('first longer partial consumes recovery and prevents later complete server read', async () => {
  vi.useFakeTimers();
  noterLeTourEnCours('synthetic');

  let fil = [
    { id: 'aimsg_u', role: 'user' as const, content: 'Synthetic request' },
    { id: 'aimsg_a', role: 'assistant' as const, content: 'Start' },
  ];

  const partial = 'Start <boltArtifact id="a"><boltAction type="file" filePath="a.ts">const a =';

  let server = partial;

  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ messages: [fil[0], { id: 'aimsg_a', role: 'assistant', content: server }] }), {
        status: 200,
      }),
  );
  vi.stubGlobal('fetch', fetcher);

  const apply = vi.fn((next) => {
    fil = next;
  });
  const hook = renderHook(() =>
    useRattrapageALaReprise({
      enabled: true,
      projectId: 'synthetic',
      isLoading: false,
      conversationId: () => 'synthetic-conversation',
      messages: () => fil,
      appliquer: apply,
    }),
  );
  await act(async () => {
    hook.result.current.armer();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(apply).toHaveBeenCalledOnce();
  expect(fil[1].content).toBe(partial);
  server = partial + '1;</boltAction></boltArtifact>';
  await act(async () => {
    await vi.advanceTimersByTimeAsync(12000);
  });
  expect(fetcher.mock.calls.length).toBeGreaterThan(1);
  expect(fil[1].content).toBe(server);
  expect(tourInterrompuAReprendre('synthetic')).toBe(true);
});

it.each(['complete', 'incomplete', 'error'] as const)(
  'same-text %s receipt ends bounded reads without replay',
  async (status) => {
    vi.useFakeTimers();
    noterLeTourEnCours('synthetic');

    let fil = [
      { id: 'aimsg_u', role: 'user' as const, content: 'Synthetic request' },
      { id: 'aimsg_a', role: 'assistant' as const, content: 'Text' },
    ];

    const receipt = createStreamTerminal({
      finishReason: status === 'complete' ? 'stop' : status === 'error' ? 'error' : 'length',
      content: 'Text',
      modeConstruction: false,
      fichiersRefuses: false,
      segments: 1,
      fileActions: 0,
      messageId: 'aimsg_a',
    });
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            messages: [
              fil[0],
              {
                ...fil[1],
                terminalReceipt: { ...receipt, contentSha256: createHash('sha256').update('Text').digest('hex') },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetcher);

    const apply = vi.fn((next) => {
      fil = next;
    });
    const hook = renderHook(() =>
      useRattrapageALaReprise({
        enabled: true,
        projectId: 'synthetic',
        isLoading: false,
        conversationId: () => 'synthetic-conversation',
        messages: () => fil,
        appliquer: apply,
      }),
    );
    await act(async () => {
      hook.result.current.armer();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(apply).toHaveBeenCalledOnce();
    expect(latestStreamTerminal(apply.mock.calls[0][0][1].annotations)?.status).toBe(status);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(tourInterrompuAReprendre('synthetic')).toBe(true);

    const { rejouerLeMessage } = await import('~/lib/hooks/useMessageParser');
    expect(rejouerLeMessage).not.toHaveBeenCalled();
  },
);
