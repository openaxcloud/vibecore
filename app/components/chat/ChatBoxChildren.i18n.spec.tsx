/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkServersAvailabilities: vi.fn(),
  initialize: vi.fn(),
  mcpState: {
    isInitialized: true,
    serverTools: {} as Record<string, unknown>,
  },
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('react-toastify', () => ({
  toast: {
    error: (...args: unknown[]) => mocks.toastError(...args),
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
  },
}));

vi.mock('~/lib/stores/mcp', () => ({
  useMCPStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      ...mocks.mcpState,
      initialize: mocks.initialize,
      checkServersAvailabilities: mocks.checkServersAvailabilities,
    }),
}));

vi.mock('~/components/@settings/tabs/mcp/McpServerList', () => ({
  default: () => <div data-testid="mcp-server-list" />,
}));

vi.mock('~/components/ui/Dialog', () => ({
  DialogRoot: ({ children }: { children: ReactNode }) => <>{children}</>,
  Dialog: ({ children, className }: HTMLAttributes<HTMLElement>) => (
    <section role="dialog" className={className}>
      {children}
    </section>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogClose: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogButton: ({ children, onClick }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

import { ChatBoxModeDropdown } from './ChatBoxModeDropdown';
import { McpTools } from './MCPTools';
import { SpeechRecognitionButton } from './SpeechRecognition';
import { WebSearch } from './WebSearch.client';
import {
  chatBoxChildrenEn,
  chatBoxChildrenFr,
  formatChatBoxChildrenCopy,
  formatChatBoxWebContent,
  getChatBoxChildrenCopy,
  getMcpToolsSafeError,
  getWebSearchSafeError,
} from '~/lib/i18n/catalogs/chat-box-children';

function renderWithLanguage(language: 'en' | 'fr' | 'es', node: ReactNode) {
  const i18n = createInstance();

  void i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr', 'es'],
    resources: { en: { translation: {} }, fr: { translation: {} }, es: { translation: {} } },
    initImmediate: false,
  });

  return render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
}

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/gu)].map((match) => match[1]).sort();
}

beforeEach(() => {
  mocks.mcpState = { isInitialized: true, serverTools: {} };
  mocks.initialize.mockReset().mockResolvedValue(undefined);
  mocks.checkServersAvailabilities.mockReset().mockResolvedValue(undefined);
  mocks.toastError.mockReset();
  mocks.toastSuccess.mockReset();
  Object.defineProperty(window, 'webkitSpeechRecognition', {
    configurable: true,
    value: class {},
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ChatBox child surfaces i18n', () => {
  it('keeps strict catalog parity, interpolation, safe errors, and English fallback', () => {
    expect(Object.keys(chatBoxChildrenFr).sort()).toEqual(Object.keys(chatBoxChildrenEn).sort());

    for (const key of Object.keys(chatBoxChildrenEn) as Array<keyof typeof chatBoxChildrenEn>) {
      expect(chatBoxChildrenEn[key].trim().length, key).toBeGreaterThan(0);
      expect(chatBoxChildrenFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(chatBoxChildrenFr[key]), key).toEqual(interpolationTokens(chatBoxChildrenEn[key]));
    }

    const fallback = getChatBoxChildrenCopy('es-MX');

    expect(fallback['chatBoxChildren.web.fetch']).toBe('Fetch');
    expect(
      formatChatBoxChildrenCopy(chatBoxChildrenFr['chatBoxChildren.mode.triggerTitle'], {
        label: 'Agent',
        description: 'Description utilisateur',
      }),
    ).toBe('Mode : Agent — Description utilisateur');
    expect(getMcpToolsSafeError('fr', 'initialize', new Error('Raw English MCP error secret=123'))).toBe(
      'Impossible d’initialiser les outils MCP. Réessayez.',
    );
    expect(getWebSearchSafeError('fr', new Error('Raw upstream URL error'))).toBe(
      'Impossible de récupérer le contenu de l’URL. Vérifiez l’adresse, puis réessayez.',
    );
  });

  it('localizes the agent mode selector and keeps long descriptions responsive', () => {
    const setAgentMode = vi.fn();
    renderWithLanguage('fr', <ChatBoxModeDropdown agentMode="assistant" setAgentMode={setAgentMode} />);

    const trigger = screen.getByRole('button', { name: 'Assistant' });

    expect(trigger.getAttribute('title')).toBe(
      'Mode : Assistant — Répond et propose des modifications ciblées, puis attend votre accord.',
    );
    fireEvent.click(trigger);

    const menu = screen.getByRole('menu', { name: 'Mode de l’agent' });

    const agentOption = within(menu).getByRole('menuitemradio', {
      name: /Agent Exécute la tâche de bout en bout, de façon autonome\./u,
    });
    const assistantDescription = within(menu).getByText(
      'Répond et propose des modifications ciblées, puis attend votre accord.',
    );

    expect(menu.className).toContain('overflow-x-hidden');
    expect(assistantDescription.className).toContain('break-words');
    fireEvent.click(agentOption);
    expect(setAgentMode).toHaveBeenCalledWith('agent');
  });

  it('localizes speech recognition labels while preserving an explicit caller label', async () => {
    const onStart = vi.fn();

    const { rerender } = renderWithLanguage(
      'fr',
      <SpeechRecognitionButton
        isListening={false}
        onStart={onStart}
        onStop={vi.fn()}
        disabled={false}
        triggerVariant="menu"
      />,
    );

    const startButton = await screen.findByRole('button', { name: 'Démarrer la reconnaissance vocale' });

    expect(startButton.textContent).toContain('Saisie vocale');
    fireEvent.click(startButton);
    expect(onStart).toHaveBeenCalledOnce();

    const i18n = createInstance();
    void i18n.use(initReactI18next).init({
      lng: 'fr',
      resources: { fr: { translation: {} } },
      initImmediate: false,
    });

    rerender(
      <I18nextProvider i18n={i18n}>
        <SpeechRecognitionButton
          isListening
          onStart={vi.fn()}
          onStop={vi.fn()}
          disabled={false}
          triggerLabel="Libellé fourni"
          triggerVariant="menu"
        />
      </I18nextProvider>,
    );

    const stopButton = await screen.findByRole('button', { name: 'Arrêter l’écoute' });

    expect(stopButton.textContent).toContain('Libellé fourni');
    expect(stopButton.textContent).not.toContain('Stop speech');
  });

  it('renders the MCP dialog in French with mobile-safe wrapping', () => {
    renderWithLanguage('fr', <McpTools triggerVariant="menu" />);

    const trigger = screen.getByRole('button', { name: 'Outils MCP disponibles' });

    expect(trigger.textContent).toContain('Outils MCP');
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog');

    expect(screen.getByRole('heading', { name: 'Outils MCP' })).toBeTruthy();
    expect(screen.getByText('Consultez et actualisez les outils MCP disponibles pour l’agent.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Vérifier la disponibilité' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Aucun serveur MCP configuré')).toBeTruthy();
    expect(screen.getByText('Configurez les serveurs dans Paramètres → Serveurs MCP')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeTruthy();
    expect(dialog.className).toContain('100dvh');
    expect(dialog.querySelector('header')?.className).toContain('flex-col');
    expect(dialog.querySelector('header')?.className).toContain('sm:flex-row');
  });

  it('masks a raw MCP initialization failure', async () => {
    const rawError = new Error('Raw MCP transport failed: bearer=secret-value');

    mocks.mcpState = { isInitialized: false, serverTools: {} };
    mocks.initialize.mockRejectedValue(rawError);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderWithLanguage('fr', <McpTools />);

    const trigger = await screen.findByRole('button', {
      name: 'Impossible d’initialiser les outils MCP — ouvrir pour plus de détails',
    });

    fireEvent.click(trigger);
    expect(screen.getByRole('alert').textContent).toBe('Impossible d’initialiser les outils MCP. Réessayez.');
    expect(document.body.textContent).not.toContain('bearer=secret-value');
  });

  it('masks a raw MCP availability failure and keeps configured server names unchanged', async () => {
    const rawError = new Error('Raw MCP availability failure: server-secret=456');

    mocks.mcpState = {
      isInitialized: true,
      serverTools: { 'customer-owned-mcp-server': { status: 'available', tools: {} } },
    };
    mocks.checkServersAvailabilities.mockRejectedValue(rawError);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderWithLanguage('fr', <McpTools />);

    fireEvent.click(screen.getByRole('button', { name: 'Outils MCP disponibles' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier la disponibilité' }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(
        'Impossible de vérifier la disponibilité des serveurs. Réessayez.',
      );
    });
    expect(screen.getByText('customer-owned-mcp-server')).toBeTruthy();
    expect(document.body.textContent).not.toContain('server-secret=456');
  });

  it('fetches web content in French while preserving external content and URL values', async () => {
    const onSearchResult = vi.fn();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          title: 'Customer-owned title',
          description: 'Customer-owned description',
          content: 'Customer-owned body',
          sourceUrl: 'https://customer.example/path',
        },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);
    renderWithLanguage('fr', <WebSearch onSearchResult={onSearchResult} triggerVariant="menu" />);

    const trigger = screen.getByRole('button', { name: 'Récupérer le contenu d’une URL' });

    expect(trigger.textContent).toContain('Récupérer une URL');
    fireEvent.click(trigger);

    const input = screen.getByRole('textbox', { name: 'URL à récupérer' });
    const panel = screen.getByRole('group', { name: 'Récupérer le contenu d’une URL' });

    expect(panel.className).toContain('flex-col');
    expect(panel.className).toContain('sm:flex-row');
    fireEvent.change(input, { target: { value: 'https://customer.example/path' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Récupérer' }));
    expect(within(panel).getByRole('button', { name: 'Récupération…' })).toBeTruthy();

    await waitFor(() => expect(onSearchResult).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/web-search',
      expect.objectContaining({ body: JSON.stringify({ url: 'https://customer.example/path' }) }),
    );
    expect(onSearchResult).toHaveBeenCalledWith(
      '[Contenu web provenant de https://customer.example/path]\n' +
        'Titre : Customer-owned title\n' +
        'Description : Customer-owned description\n\n' +
        'Customer-owned body',
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Contenu de l’URL récupéré');
  });

  it('masks raw web API errors and leaves the retry form usable', async () => {
    const rawError = 'Upstream English failure: internal-token=secret';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: rawError }),
    });

    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderWithLanguage('fr', <WebSearch onSearchResult={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Récupérer le contenu d’une URL' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'URL à récupérer' }), {
      target: { value: 'https://customer.example/retry' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Récupérer' }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        'Impossible de récupérer le contenu de l’URL. Vérifiez l’adresse, puis réessayez.',
      );
    });
    expect(document.body.textContent).not.toContain(rawError);
    expect(screen.getByRole('textbox', { name: 'URL à récupérer' })).toBeTruthy();
  });

  it('formats web result wrappers in English for fallback locales without changing payload values', () => {
    expect(
      formatChatBoxWebContent(
        {
          title: 'Titre utilisateur',
          description: '',
          content: 'Contenu utilisateur',
          sourceUrl: 'https://user.example',
        },
        'es',
      ),
    ).toBe('[Web content from https://user.example]\nTitle: Titre utilisateur\n\nContenu utilisateur');
  });
});
