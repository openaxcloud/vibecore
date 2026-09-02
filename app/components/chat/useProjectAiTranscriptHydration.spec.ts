/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook } from '@testing-library/react';
import type { Message } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useProjectAiTranscriptHydration,
  type ProjectAiTranscriptHydrationOptions,
} from './useProjectAiTranscriptHydration';

afterEach(cleanup);

const transcript: Message[] = [
  { id: 'u1', role: 'user', content: 'Ajoute une page de contact.' },
  { id: 'a1', role: 'assistant', content: 'La page est créée.' },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function baseOptions(overrides: Partial<ProjectAiTranscriptHydrationOptions> = {}) {
  return {
    enabled: true,
    projectId: 'proj_1',
    hasMessages: false,
    conversationId: 'conv_1',
    resolveConversationId: () => 'conv_1',
    loadTranscript: vi.fn(async () => transcript),
    applyTranscript: vi.fn(),
    onLoadError: vi.fn(),
    onRetriesExhausted: vi.fn(),
    ...overrides,
  } satisfies ProjectAiTranscriptHydrationOptions;
}

describe('useProjectAiTranscriptHydration', () => {
  it('applies a transcript that resolves after a consumer callback changed identity', async () => {
    /*
     * The live defect: `storeMessageHistory` was recreated on every render of
     * Chat.client, so this effect re-ran while the request was in flight. Re-render
     * with brand-new callback identities between dispatch and resolution — the
     * transcript must still land.
     */
    const pending = deferred<Message[]>();
    const applyTranscript = vi.fn();

    const { rerender } = renderHook(
      (props: ProjectAiTranscriptHydrationOptions) => useProjectAiTranscriptHydration(props),
      {
        initialProps: baseOptions({
          applyTranscript,
          loadTranscript: vi.fn(() => pending.promise),
        }),
      },
    );

    // Every callback identity churns, exactly as an unmemoized consumer would.
    rerender(
      baseOptions({
        applyTranscript,
        loadTranscript: vi.fn(() => pending.promise),
        resolveConversationId: () => 'conv_1',
      }),
    );

    await act(async () => {
      pending.resolve(transcript);
      await pending.promise;
    });

    expect(applyTranscript).toHaveBeenCalledTimes(1);
    expect(applyTranscript).toHaveBeenCalledWith(transcript);
  });

  it('fetches the transcript only once across re-renders', async () => {
    const loadTranscript = vi.fn(async () => transcript);
    const applyTranscript = vi.fn();

    const { rerender } = renderHook(
      (props: ProjectAiTranscriptHydrationOptions) => useProjectAiTranscriptHydration(props),
      { initialProps: baseOptions({ loadTranscript, applyTranscript }) },
    );

    await act(async () => {
      await Promise.resolve();
    });

    rerender(baseOptions({ loadTranscript, applyTranscript }));
    rerender(baseOptions({ loadTranscript, applyTranscript }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(loadTranscript).toHaveBeenCalledTimes(1);
    expect(applyTranscript).toHaveBeenCalledTimes(1);
  });

  it('abandons the transcript when the panel unmounts before it resolves', async () => {
    const pending = deferred<Message[]>();
    const applyTranscript = vi.fn();

    const { unmount } = renderHook(
      (props: ProjectAiTranscriptHydrationOptions) => useProjectAiTranscriptHydration(props),
      {
        initialProps: baseOptions({
          applyTranscript,
          loadTranscript: vi.fn(() => pending.promise),
        }),
      },
    );

    unmount();

    await act(async () => {
      pending.resolve(transcript);
      await pending.promise;
    });

    expect(applyTranscript).not.toHaveBeenCalled();
  });

  it('does not hydrate when a transcript is already on screen', async () => {
    const loadTranscript = vi.fn(async () => transcript);

    renderHook((props: ProjectAiTranscriptHydrationOptions) => useProjectAiTranscriptHydration(props), {
      initialProps: baseOptions({ hasMessages: true, loadTranscript }),
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(loadTranscript).not.toHaveBeenCalled();
  });

  it('retries a failed load and reports once the bounded retries are exhausted', async () => {
    vi.useFakeTimers();

    try {
      const loadTranscript = vi.fn(async () => {
        throw new Error('AI transcript load failed (502)');
      });

      const onLoadError = vi.fn();
      const onRetriesExhausted = vi.fn();
      const applyTranscript = vi.fn();

      const options = () => baseOptions({ loadTranscript, onLoadError, onRetriesExhausted, applyTranscript });

      renderHook((props: ProjectAiTranscriptHydrationOptions) => useProjectAiTranscriptHydration(props), {
        initialProps: options(),
      });

      // 1 initial attempt + 3 bounded retries (MAX_TRANSCRIPT_HYDRATION_RETRIES).
      for (let i = 0; i < 4; i += 1) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(10_000);
        });
      }

      expect(loadTranscript).toHaveBeenCalledTimes(4);
      expect(onLoadError).toHaveBeenCalledTimes(4);
      expect(onRetriesExhausted).toHaveBeenCalledTimes(1);
      expect(applyTranscript).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('hydrate quand l’identifiant de conversation arrive APRÈS le premier rendu', async () => {
    /*
     * Le défaut mesuré sur main, le 2026-09-02, avec le serveur sain.
     *
     * L'identifiant vient de l'état IDE persisté, chargé de façon asynchrone :
     * mesuré, le premier `GET /ide-state` répond sans identifiant, le second
     * avec. Mais l'effet ne dépendait que de `[enabled, hasMessages, projectId,
     * restartRetries, retryNonce]` et lisait l'identifiant via une `ref` et une
     * lecture de store non souscrite — deux sources non réactives. Parti une
     * fois « sans identifiant », il ressortait aussitôt et n'était JAMAIS
     * rejoué : la conversation restait vide pour toute la durée de la page,
     * alors que le serveur avait bien renvoyé ses messages.
     */
    const loadTranscript = vi.fn(async () => transcript);
    const applyTranscript = vi.fn();

    // Un porteur mutable : la valeur doit changer ENTRE deux rendus.
    const etat: { identifiant: string | undefined } = { identifiant: undefined };

    const { rerender } = renderHook(
      (props: ProjectAiTranscriptHydrationOptions) => useProjectAiTranscriptHydration(props),
      {
        initialProps: baseOptions({
          conversationId: undefined,
          resolveConversationId: () => etat.identifiant,
          loadTranscript,
          applyTranscript,
        }),
      },
    );

    expect(loadTranscript, 'rien ne doit être chargé sans identifiant').not.toHaveBeenCalled();

    // L'identifiant arrive : deuxième réponse de l'état IDE.
    etat.identifiant = 'conv_1';

    await act(async () => {
      rerender(
        baseOptions({
          conversationId: 'conv_1',
          resolveConversationId: () => etat.identifiant,
          loadTranscript,
          applyTranscript,
        }),
      );
    });

    expect(loadTranscript, 'l’arrivée tardive de l’identifiant ne relance pas l’hydratation').toHaveBeenCalledWith(
      'proj_1',
      'conv_1',
    );
    expect(applyTranscript, 'la transcription n’est jamais appliquée').toHaveBeenCalledWith(transcript);
  });
});
