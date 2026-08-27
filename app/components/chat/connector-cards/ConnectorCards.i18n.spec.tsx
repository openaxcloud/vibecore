/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Cookies from 'js-cookie';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const popupMock = vi.hoisted(() => ({
  state: { phase: 'idle' } as ConnectorPopupState,
  launch: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('~/lib/chat/use-connector-popup', () => ({
  useConnectorPopup: () => popupMock,
}));

import { ConnectionRequestCard } from './ConnectionRequestCard';
import { SecretRequestCard } from './SecretRequestCard';
import { APIKeyManager } from '~/components/chat/APIKeyManager';
import type { ConnectionRequestMessage, SecretRequestMessage } from '~/lib/chat/connector-messages';
import type { ConnectorPopupState } from '~/lib/chat/use-connector-popup';
import { createI18nInstance } from '~/lib/i18n/runtime';
import type { ProviderInfo } from '~/types/model';

function withLocale(language: 'en' | 'fr', node: ReactNode) {
  return <I18nextProvider i18n={createI18nInstance(language)}>{node}</I18nextProvider>;
}

const connectionPayload: ConnectionRequestMessage = {
  kind: 'connection_request',
  messageId: 'message-1',
  provider: 'github',
  providerDisplayName: 'GitHub',
  providerLogoUrl: 'https://example.test/github.svg',
  reason: 'Accès nécessaire pour synchroniser le dépôt.',
  resumeToken: 'resume-1',
  scopes: [
    { scope: 'repo', label: 'Dépôts', description: 'Lecture et écriture' },
    { scope: 'user:email', label: 'Adresse e-mail' },
  ],
  existingAccountConnections: [
    {
      userConnectionId: 'connection-1',
      accountLabel: 'octocat',
      scopes: ['repo'],
      scopesMatch: true,
    },
  ],
};

const secretPayload: SecretRequestMessage = {
  kind: 'secret_request',
  messageId: 'message-2',
  secretKey: 'OPENAI_API_KEY',
  displayName: 'OpenAI',
  description: 'Clé utilisée par le runtime du projet.',
  resumeToken: 'resume-2',
  fields: [
    {
      name: 'OPENAI_API_KEY',
      label: 'Clé API OpenAI',
      type: 'password',
      required: true,
      placeholder: 'sk-…',
    },
  ],
};

beforeEach(() => {
  popupMock.state = { phase: 'idle' };
  popupMock.launch.mockReset();
  popupMock.reset.mockReset();
  Cookies.remove('apiKeys');
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('chat connector cards i18n', () => {
  it('renders API-key loading and configuration states in French', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ isSet: false }),
      }),
    );

    const provider: ProviderInfo = {
      name: 'Ollama',
      staticModels: [],
      getApiKeyLink: 'https://ollama.com/download',
      labelForGetApiKey: 'Download Ollama',
    };

    render(withLocale('fr', <APIKeyManager provider={provider} apiKey="" setApiKey={vi.fn()} />));

    expect(screen.getByText('Vérification de la configuration de l’environnement…')).toBeTruthy();
    expect(await screen.findByText(/Non configurée/)).toBeTruthy();
    expect(screen.getByText('Télécharger Ollama')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Modifier la clé API' }));

    expect(screen.getByLabelText('Clé API Ollama')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enregistrer la clé API' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
  });

  it('switches connection copy from French to English without changing provider data', async () => {
    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <ConnectionRequestCard payload={connectionPayload} projectId="project-1" />
      </I18nextProvider>,
    );

    expect(screen.getByText('Connecter GitHub')).toBeTruthy();
    expect(screen.getByText('2 autorisations demandées')).toBeTruthy();
    expect(screen.getByText('Les autorisations correspondent')).toBeTruthy();
    expect(screen.getByText('octocat')).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByText('Connect GitHub')).toBeTruthy();
    expect(screen.getByText('2 requested permissions')).toBeTruthy();
    expect(screen.getByText('Permissions match')).toBeTruthy();
    expect(screen.getByText('octocat')).toBeTruthy();
  });

  it('masks provider failure details and notifies the caller from an effect only once', () => {
    popupMock.state = {
      phase: 'failed',
      result: {
        ok: false,
        provider: 'github',
        errorCode: 'PROVIDER_DENIED',
        errorMessage: 'Raw upstream English detail must stay hidden.',
      },
    };

    const onFailed = vi.fn();
    const view = render(withLocale('fr', <ConnectionRequestCard payload={connectionPayload} onFailed={onFailed} />));

    expect(screen.getByText('Échec de la connexion à GitHub')).toBeTruthy();
    expect(screen.getByText('Impossible d’établir la connexion. Réessayez.')).toBeTruthy();
    expect(screen.queryByText('Raw upstream English detail must stay hidden.')).toBeNull();
    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(onFailed).toHaveBeenCalledWith({
      errorCode: 'PROVIDER_DENIED',
      errorMessage: 'Impossible d’établir la connexion. Réessayez.',
    });

    view.rerender(withLocale('fr', <ConnectionRequestCard payload={connectionPayload} onFailed={onFailed} />));
    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  it('localizes required-field validation and masks secret API errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Raw server error in English.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(withLocale('fr', <SecretRequestCard payload={secretPayload} projectId="project-1" />));

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer OpenAI' }));
    expect(screen.getByRole('alert').textContent).toBe('Le champ Clé API OpenAI est obligatoire.');

    fireEvent.change(screen.getByPlaceholderText('sk-…'), { target: { value: 'sk-secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer OpenAI' }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Impossible d’enregistrer le secret.');
    });
    expect(screen.queryByText('Raw server error in English.')).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1/secrets', expect.any(Object));
  });
});
