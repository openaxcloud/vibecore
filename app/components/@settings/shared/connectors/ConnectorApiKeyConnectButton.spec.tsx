/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectorApiKeyConnectButton } from './ConnectorApiKeyConnectButton';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en', resolvedLanguage: 'en' } }),
}));

vi.mock('~/lib/stores/logs', () => ({
  logStore: {
    logSystem: vi.fn(),
    logError: vi.fn(),
  },
}));

/**
 * Regression: after a successful api-key connect the success branch of
 * handleSubmit set `success`/cleared the token but never called
 * `setExpanded(false)`. With `expanded` still true the component kept
 * rendering the expanded <form> (a now-blank password input, a disabled
 * "Save token" button and a "Cancel" link) on top of the green
 * "Connected as X" line — implying the connection had not completed and
 * inviting a confusing re-submit. A successful connect must collapse the
 * form back to the compact "Connect (API key)" view.
 */
describe('ConnectorApiKeyConnectButton successful connect', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          userConnectionId: 'conn_123',
          provider: 'vercel',
          accountLabel: 'acme-team',
        }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('collapses the form and shows the success message after a successful connect', async () => {
    const onConnected = vi.fn();

    render(<ConnectorApiKeyConnectButton provider="vercel" displayName="Vercel" onConnected={onConnected} />);

    // Open the inline form.
    fireEvent.click(screen.getByRole('button', { name: /Connect Vercel \(API key\)/i }));

    const input = screen.getByPlaceholderText(/Paste your Vercel access token/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'tok_live_secret' } });

    fireEvent.click(screen.getByRole('button', { name: /Save token/i }));

    await waitFor(() =>
      expect(onConnected).toHaveBeenCalledWith({ userConnectionId: 'conn_123', accountLabel: 'acme-team' }),
    );

    // The expanded form must be gone: no password input, no Save/Cancel controls.
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/Paste your Vercel access token/i)).toBeNull();
    });
    expect(screen.queryByRole('button', { name: /Save token/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Cancel/i })).toBeNull();

    // The compact view with the success message is what remains.
    expect(screen.getByText('Connected as acme-team')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Connect Vercel \(API key\)/i })).toBeTruthy();
  });
});
