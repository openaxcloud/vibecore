// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import type { Message } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('~/lib/hooks/useMessageParser', () => ({ rejouerLeMessage: vi.fn() }));
vi.mock('~/lib/stores/workbench', () => ({ workbenchStore: { autoriserLaReprise: vi.fn() } }));
import { useRattrapageALaReprise } from './useRattrapageALaReprise';
import { workbenchStore } from '~/lib/stores/workbench';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe('bounded transcript recovery scope', () => {
  it.each(['project', 'conversation', 'unmount', 'stop', 'active'] as const)(
    'late server read after %s',
    async (action) => {
      let finish!: (response: Response) => void;
      let conversation = 'conversation-A';

      const fetchFixture = vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      );
      vi.stubGlobal('fetch', fetchFixture);

      const apply = vi.fn();
      const messages: Message[] = [{ id: 'aimsg_user', role: 'user', content: 'fixture' }];

      const hook = renderHook(
        ({ projectId }) =>
          useRattrapageALaReprise({
            enabled: true,
            projectId,
            isLoading: false,
            conversationId: () => conversation,
            messages: () => messages,
            appliquer: apply,
          }),
        { initialProps: { projectId: 'A' } },
      );
      act(() => hook.result.current.armer());
      expect(fetchFixture).toHaveBeenCalledOnce();

      if (action === 'project') {
        hook.rerender({ projectId: 'B' });
      }

      if (action === 'conversation') {
        conversation = 'conversation-B';
      }

      if (action === 'unmount') {
        hook.unmount();
      }

      if (action === 'stop') {
        act(() => hook.result.current.annuler());
      }

      await act(async () => {
        finish(
          new Response(
            JSON.stringify({
              messages: [
                ...messages,
                { id: 'aimsg_assistant', role: 'assistant', content: 'Synthetic recovered response' },
              ],
            }),
            { status: 200 },
          ),
        );
        await Promise.resolve();
      });
      expect(apply).toHaveBeenCalledTimes(action === 'active' ? 1 : 0);
      expect(workbenchStore.autoriserLaReprise).toHaveBeenCalledTimes(action === 'active' ? 1 : 0);
      expect(fetchFixture).toHaveBeenCalledOnce();
    },
  );
});
