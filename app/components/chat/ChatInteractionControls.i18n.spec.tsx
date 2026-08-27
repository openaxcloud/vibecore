/** @vitest-environment jsdom */

import type { FileUIPart } from '@ai-sdk/ui-utils';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  downloadZip: vi.fn(),
  highlightShouldFail: false,
  writeText: vi.fn(),
}));

vi.mock('shiki', () => ({
  bundledLanguages: { plaintext: {}, typescript: {} },
  isSpecialLang: () => false,
  codeToHtml: async (code: string) => {
    if (mocks.highlightShouldFail) {
      throw new Error('Raw Shiki worker failure');
    }

    return `<pre><code>${code}</code></pre>`;
  },
}));

vi.mock('~/lib/stores/theme', async () => {
  const { atom } = await import('nanostores');

  return { themeStore: atom<'dark' | 'light'>('dark') };
});

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: { downloadZip: mocks.downloadZip },
}));

vi.mock('~/components/sidebar/HistoryItem', () => ({
  useCoarsePointer: () => false,
}));

vi.mock('~/utils/constants', () => ({
  MODEL_REGEX: /\[Model:[^\]]*\]/giu,
  PROVIDER_REGEX: /\[Provider:[^\]]*\]/giu,
}));

vi.mock('~/utils/logger', () => ({
  createScopedLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('@radix-ui/react-dropdown-menu', () => ({
  Root: ({ children }: { children: ReactNode }) => <>{children}</>,
  Trigger: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Content: ({ children }: { children: ReactNode }) => <div role="menu">{children}</div>,
  Item: ({ children, onClick, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div role="menuitem" onClick={onClick} {...props}>
      {children}
    </div>
  ),
}));

vi.mock('./Markdown', () => ({
  Markdown: ({ children }: { children: string }) => <div>{children}</div>,
}));

import { CodeBlock } from './CodeBlock';
import { SupabaseChatAlert } from './SupabaseAlert';
import { UserMessage } from './UserMessage';
import { ExportChatButton } from './chatExportAndImport/ExportChatButton';
import { profileStore } from '~/lib/stores/profile';
import { supabaseConnection } from '~/lib/stores/supabase';

function renderLocalized(node: ReactNode, language: 'en' | 'fr' = 'fr') {
  const i18n = createInstance();

  void i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr'],
    resources: { en: { translation: {} }, fr: { translation: {} } },
    initImmediate: false,
  });

  return {
    ...render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>),
    i18n,
  };
}

beforeEach(() => {
  mocks.downloadZip.mockReset();
  mocks.highlightShouldFail = false;
  mocks.writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mocks.writeText },
  });
  profileStore.set({ username: '', bio: '', avatar: '' });
  supabaseConnection.set({ user: null, token: '', isConnected: false, selectedProjectId: undefined });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('remaining interactive chat controls i18n', () => {
  it('localizes the code-copy state live and keeps code identifiers unchanged', async () => {
    const code = 'const API_KEY_NAME = "SUPABASE_URL";';
    const { i18n } = renderLocalized(<CodeBlock code={code} language="typescript" />);
    const copyButton = await screen.findByRole('button', { name: 'Copier le code' });

    expect(copyButton.className).toContain('min-h-11');
    expect(screen.getByText('typescript')).toBeTruthy();
    fireEvent.click(copyButton);

    expect((await screen.findByRole('status')).textContent).toContain('Copié');
    expect(mocks.writeText).toHaveBeenCalledWith(code);

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Copied');
    expect(document.body.textContent).toContain('API_KEY_NAME');
    expect(document.body.textContent).toContain('SUPABASE_URL');
  });

  it('falls back to plain code with a safe localized message when highlighting fails', async () => {
    mocks.highlightShouldFail = true;
    renderLocalized(<CodeBlock code="pnpm run build --filter @vibecore/web" language="typescript" disableCopy />);

    expect(
      await screen.findByText('La coloration syntaxique est indisponible. Le code est affiché en texte brut.'),
    ).toBeTruthy();
    expect(screen.getByText('pnpm run build --filter @vibecore/web')).toBeTruthy();
    expect(screen.queryByText('Raw Shiki worker failure')).toBeNull();
  });

  it('localizes Supabase states live and never exposes a raw API error', async () => {
    const disconnected = renderLocalized(
      <SupabaseChatAlert
        alert={{ type: 'supabase', content: 'SELECT * FROM invoices;' }}
        clearAlert={vi.fn()}
        postMessage={vi.fn()}
      />,
    );

    expect(screen.getByText('Connexion Supabase requise')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connecter Supabase' }).className).toContain('min-h-11');

    await act(async () => {
      await disconnected.i18n.changeLanguage('en');
    });

    expect(screen.getByText('Supabase connection required')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connect Supabase' })).toBeTruthy();
    disconnected.unmount();

    act(() => {
      supabaseConnection.set({
        user: null,
        token: 'token-must-not-render',
        selectedProjectId: 'project-42',
        isConnected: true,
      });
    });

    const postMessage = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: 'Raw upstream English database failure secret=123' } }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    renderLocalized(
      <SupabaseChatAlert
        alert={{ type: 'supabase', content: 'SELECT * FROM invoices;' }}
        clearAlert={vi.fn()}
        postMessage={postMessage}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les modifications' }));

    expect(
      await screen.findByText('La requête Supabase n’a pas pu être appliquée. Vérifiez le SQL, puis réessayez.'),
    ).toBeTruthy();
    expect(postMessage).toHaveBeenCalledWith(
      'La requête Supabase n’a pas pu être appliquée. Vérifiez le SQL et renvoyez une requête corrigée.',
    );
    expect(screen.queryByText(/Raw upstream|secret=123|token-must-not-render/u)).toBeNull();

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const requestBody = JSON.parse(String((fetchCall[1] as RequestInit).body)) as { projectId: string; query: string };

    expect(requestBody).toEqual({ projectId: 'project-42', query: 'SELECT * FROM invoices' });
  });

  it('localizes export actions live with touch-safe targets', async () => {
    const { i18n } = renderLocalized(<ExportChatButton exportChat={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Exporter' });

    expect(trigger.className).toContain('min-h-11');
    expect(screen.getByText('Télécharger le code')).toBeTruthy();
    expect(screen.getByText('Exporter la conversation')).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
    expect(screen.getByText('Download code')).toBeTruthy();
    expect(screen.getByText('Export conversation')).toBeTruthy();
  });

  it('localizes user-message controls and image alternatives while preserving message text', async () => {
    profileStore.set({ username: '', bio: '', avatar: 'https://example.test/avatar.png' });

    const imagePart = {
      type: 'file',
      mimeType: 'image/png',
      data: 'aW1hZ2U=',
    } as FileUIPart;
    const { i18n } = renderLocalized(
      <UserMessage
        content={[{ type: 'text', text: 'Conservez API_KEY_NAME tel quel' }]}
        parts={[imagePart]}
        messageId="message-1"
        canEdit
      />,
    );

    expect(screen.getByAltText('Utilisateur')).toBeTruthy();
    expect(screen.getByAltText('Image jointe 1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Modifier et renvoyer ce message' }).className).toContain('min-h-11');
    expect(screen.getByText('Conservez API_KEY_NAME tel quel')).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByAltText('User')).toBeTruthy();
    expect(screen.getByAltText('Attached image 1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit and resend this message' })).toBeTruthy();
    expect(screen.getByText('Conservez API_KEY_NAME tel quel')).toBeTruthy();
  });
});
