/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  launch: vi.fn(),
  state: { phase: 'idle' } as
    | { phase: 'idle' }
    | { phase: 'failed'; result: { ok: false; provider: string; errorMessage?: string } }
    | {
        phase: 'succeeded';
        result: { ok: true; provider: string; userConnectionId: string; accountLabel: string };
      },
}));

vi.mock('~/lib/chat/use-connector-popup', () => ({
  useConnectorPopup: () => ({ state: mocks.state, launch: mocks.launch, reset: vi.fn() }),
}));

import { ReconnectionRequiredBanner } from './ReconnectionRequiredBanner';
import type { ReconnectionRequiredMessage } from '~/lib/chat/connector-messages';

const payload: ReconnectionRequiredMessage = {
  kind: 'reconnection_required',
  messageId: 'message-1',
  provider: 'github',
  providerDisplayName: 'GitHub',
  userConnectionId: 'connection-1',
  reason: 'scope_insufficient',
  resumeToken: 'resume-1',
};

function createTestI18n() {
  const i18n = createInstance();

  void i18n.use(initReactI18next).init({
    lng: 'fr',
    fallbackLng: 'en',
    resources: { en: { translation: {} }, fr: { translation: {} } },
    initImmediate: false,
  });

  return i18n;
}

beforeEach(() => {
  mocks.state = { phase: 'idle' };
  mocks.launch.mockReset();
});

afterEach(cleanup);

describe('<ReconnectionRequiredBanner /> i18n', () => {
  it('switches reconnect copy live while preserving the provider name', async () => {
    const i18n = createTestI18n();

    render(
      <I18nextProvider i18n={i18n}>
        <ReconnectionRequiredBanner payload={payload} />
      </I18nextProvider>,
    );

    expect(screen.getAllByText('Reconnecter GitHub')).toHaveLength(2);
    expect(screen.getByText('Les autorisations actuelles ne couvrent plus la demande de l’agent.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reconnecter GitHub' }).className).toContain('min-h-11');

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getAllByText('Reconnect GitHub')).toHaveLength(2);
    expect(screen.getByText('The current scopes no longer cover the agent request.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reconnect GitHub' })).toBeTruthy();
  });

  it('masks raw popup failures and localizes a successful account label', () => {
    const i18n = createTestI18n();
    mocks.state = {
      phase: 'failed',
      result: {
        ok: false,
        provider: 'github',
        errorMessage: 'Raw popup English error secret=123',
      },
    };

    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <ReconnectionRequiredBanner payload={payload} />
      </I18nextProvider>,
    );

    expect(
      screen.getByText('L’autorisation n’a pas abouti. Vérifiez les paramètres des fenêtres pop-up, puis réessayez.'),
    ).toBeTruthy();
    expect(screen.queryByText(/Raw popup|secret=123/u)).toBeNull();

    mocks.state = {
      phase: 'succeeded',
      result: {
        ok: true,
        provider: 'github',
        userConnectionId: 'connection-1',
        accountLabel: 'avi@example.test',
      },
    };
    rerender(
      <I18nextProvider i18n={i18n}>
        <ReconnectionRequiredBanner payload={payload} />
      </I18nextProvider>,
    );

    expect(screen.getByText('GitHub a été reconnecté avec le compte avi@example.test.')).toBeTruthy();
  });
});
