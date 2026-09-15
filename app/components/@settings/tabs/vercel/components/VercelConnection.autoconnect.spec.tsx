/**
 * @vitest-environment jsdom
 *
 * AUDX-161 — a guard must mean "this SUCCEEDED", not "this STARTED".
 *
 * VercelConnection set its `hasInitialized` latch BEFORE awaiting
 * autoConnectVercel(). A failed auto-connection — expired env token, a Vercel
 * blip, an offline laptop — latched anyway, so nothing ever retried for the life
 * of the mount: a disconnected panel holding a valid token, with no error path
 * that anyone would notice. Silent and intermittent, which is why the class is
 * worth a registry line of its own.
 *
 * The reference form already in this repo is useProjectAiTranscriptHydration.ts:
 * it latches early too, but pairs the latch with a bounded retry. The latch was
 * never the bug — the missing retry was.
 */
import { render, waitFor } from '@testing-library/react';
import { atom } from 'nanostores';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const autoConnectVercel = vi.fn();
const fetchVercelStats = vi.fn(async () => undefined);
const vercelConnection = atom<{ user: unknown; token: string; stats?: unknown }>({ user: null, token: 'env-token' });

vi.mock('~/lib/stores/vercel', () => ({
  vercelConnection,
  isConnecting: atom(false),
  isFetchingStats: atom(false),
  updateVercelConnection: vi.fn(),
  fetchVercelStats,
  autoConnectVercel,
}));

vi.mock('~/lib/stores/logs', () => ({ logStore: { logInfo: vi.fn(), logError: vi.fn() } }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'en', language: 'en' } }),
}));

const { default: VercelConnection } = await import('./VercelConnection');

beforeEach(() => {
  vi.stubEnv('VITE_VERCEL_ACCESS_TOKEN', 'env-token');
  autoConnectVercel.mockReset();
  vercelConnection.set({ user: null, token: 'env-token' });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('AUDX-161 Vercel auto-connect retry', () => {
  /*
   * THE test. A first failure must not close the door: a later render — a token
   * arriving, the user reopening the panel — has to be able to try again.
   */
  it('retries after a FAILED auto-connection', async () => {
    autoConnectVercel.mockResolvedValueOnce({ success: false, error: 'network' });

    const view = render(<VercelConnection />);
    await waitFor(() => expect(autoConnectVercel).toHaveBeenCalledTimes(1));

    autoConnectVercel.mockResolvedValueOnce({ success: true });

    // Model a later render caused by the connection input changing.
    vercelConnection.set({ user: null, token: 'env-token-2' });
    view.rerender(<VercelConnection />);

    await waitFor(() => expect(autoConnectVercel).toHaveBeenCalledTimes(2));
  });

  /*
   * Rule 19 counterpart: the latch still has to do its original job. A SUCCESS
   * must not be repeated on every render — that would hammer Vercel and toast
   * the user endlessly.
   */
  it('does NOT retry after a successful auto-connection', async () => {
    autoConnectVercel.mockResolvedValue({ success: true });

    const view = render(<VercelConnection />);
    await waitFor(() => expect(autoConnectVercel).toHaveBeenCalledTimes(1));

    vercelConnection.set({ user: null, token: 'env-token-3' });
    view.rerender(<VercelConnection />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(autoConnectVercel).toHaveBeenCalledTimes(1);
  });
});
