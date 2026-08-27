/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReconnectionRequiredBanner } from './ReconnectionRequiredBanner';
import type { ReconnectionRequiredMessage } from '~/lib/chat/connector-messages';

/*
 * The reconnect button only calls launch() on a successful 2xx response.
 * Before the fix, a non-ok response or a thrown fetch error left the
 * useConnectorPopup hook in 'idle' (never 'launching'/'failed'), so the
 * button silently reverted with no toast, popup, or inline error — the
 * user got zero feedback. These specs render the real component and assert
 * that both failure paths now surface a role="alert" line.
 */

const launch = vi.fn();

vi.mock('~/lib/chat/use-connector-popup', () => ({
  useConnectorPopup: () => ({
    state: { phase: 'idle' },
    launch,
    reset: vi.fn(),
  }),
}));

const payload: ReconnectionRequiredMessage = {
  kind: 'reconnection_required',
  messageId: 'msg_1',
  provider: 'github',
  providerDisplayName: 'GitHub',
  userConnectionId: 'uc_1',
  reason: 'token_expired',
  resumeToken: 'resume_1',
};

describe('ReconnectionRequiredBanner reconnect failure feedback', () => {
  beforeEach(() => {
    launch.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('masks a server error message when the connect endpoint returns a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'Provider temporarily unavailable' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );

    render(<ReconnectionRequiredBanner payload={payload} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect GitHub' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('The reconnection could not be started. Try again.');
    expect(screen.queryByText('Provider temporarily unavailable')).toBeNull();
    expect(launch).not.toHaveBeenCalled();
  });

  it('uses the same safe message when the error body is not parseable JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>nope</html>', { status: 500 })),
    );

    render(<ReconnectionRequiredBanner payload={payload} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect GitHub' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('The reconnection could not be started. Try again.');
    expect(screen.queryByText(/HTTP 500/u)).toBeNull();
    expect(launch).not.toHaveBeenCalled();
  });

  it('masks a thrown fetch error with actionable localized copy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Network down');
      }),
    );

    render(<ReconnectionRequiredBanner payload={payload} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect GitHub' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('The reconnection could not be started. Try again.');
    expect(screen.queryByText('Network down')).toBeNull();
    expect(launch).not.toHaveBeenCalled();
  });

  it('launches the popup and shows no error on a successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ provider: 'github', authorizationUrl: 'https://example.com/auth' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );

    render(<ReconnectionRequiredBanner payload={payload} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect GitHub' }));

    await waitFor(() =>
      expect(launch).toHaveBeenCalledWith({ authorizationUrl: 'https://example.com/auth', provider: 'github' }),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
