/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionForm, type ConnectionFormProps } from './ConnectionForm';
import {
  connectionFormEn,
  connectionFormFr,
  formatConnectionFormCopy,
  getConnectionFormCopy,
  getConnectionFormErrorMessage,
} from '~/lib/i18n/catalogs/connection-form';

const harness = vi.hoisted(() => ({
  language: 'fr',
  reduceMotion: false,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: harness.language, resolvedLanguage: harness.language },
  }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className }: { children: ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
  },
  useReducedMotion: () => harness.reduceMotion,
}));

function createProps(overrides: Partial<ConnectionFormProps> = {}): ConnectionFormProps {
  return {
    isConnected: false,
    isConnecting: false,
    token: 'token_live_ABC123',
    onTokenChange: vi.fn(),
    onConnect: vi.fn((event: React.FormEvent) => event.preventDefault()),
    onDisconnect: vi.fn(),
    serviceName: 'GitHub',
    getTokenUrl: 'https://github.com/settings/tokens?type=beta',
    environmentVariable: 'GITHUB_TOKEN',
    tokenTypes: [
      { value: 'classic_token', label: 'Jeton classique', description: 'Accès à tous les dépôts autorisés' },
      { value: 'fine_grained_token', label: 'Jeton à granularité fine', description: 'Accès limité aux dépôts' },
    ],
    selectedTokenType: 'fine_grained_token',
    onTokenTypeChange: vi.fn(),
    ...overrides,
  };
}

function renderForm(overrides: Partial<ConnectionFormProps> = {}) {
  const props = createProps(overrides);
  const view = render(<ConnectionForm {...props} />);

  return { ...view, props };
}

describe('ConnectionForm i18n and enterprise states', () => {
  beforeEach(() => {
    harness.language = 'fr';
    harness.reduceMotion = false;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps flat EN/FR parity, English fallback, interpolation, and reviewed safe error variants', () => {
    expect(Object.keys(connectionFormFr).sort()).toEqual(Object.keys(connectionFormEn).sort());
    expect(getConnectionFormCopy('fr-CA')['connectionForm.action.connect']).toBe('Se connecter');
    expect(getConnectionFormCopy('de-DE')['connectionForm.action.connect']).toBe('Connect');
    expect(
      formatConnectionFormCopy(connectionFormFr['connectionForm.form.label'], {
        serviceName: 'GitHub Enterprise',
      }),
    ).toBe('Connexion à GitHub Enterprise');
    expect(getConnectionFormErrorMessage('invalidToken', 'GitHub', 'fr')).toBe(
      'GitHub a refusé ce jeton. Vérifiez ses autorisations ou créez-en un nouveau, puis réessayez.',
    );
    expect(getConnectionFormErrorMessage('networkUnavailable', 'GitHub', 'en')).toBe(
      'We could not reach GitHub. Check your network connection, then try again.',
    );
    expect(getConnectionFormErrorMessage(undefined, 'GitHub', 'fr')).toBe(
      'Impossible d’établir la connexion à GitHub. Vérifiez le jeton, puis réessayez.',
    );
  });

  it('renders the complete disconnected form in French and preserves technical data verbatim', () => {
    const view = renderForm();

    expect(screen.getByRole('form', { name: 'Connexion à GitHub' })).toBeTruthy();

    const tokenType = screen.getByRole('combobox', { name: 'Type de jeton' }) as HTMLSelectElement;
    expect(tokenType.value).toBe('fine_grained_token');
    expect([...tokenType.options].map((option) => option.value)).toEqual(['classic_token', 'fine_grained_token']);
    expect(screen.getByText('Accès limité aux dépôts')).toBeTruthy();

    const tokenInput = screen.getByLabelText('Jeton d’accès') as HTMLInputElement;
    expect(tokenInput.type).toBe('password');
    expect(tokenInput.value).toBe('token_live_ABC123');
    expect(tokenInput.placeholder).toBe('Saisissez votre jeton d’accès GitHub');
    expect(tokenInput.required).toBe(true);
    expect(tokenInput.autocomplete).toBe('off');
    expect(tokenInput.getAttribute('spellcheck')).toBe('false');

    const tokenLink = screen.getByRole('link', { name: /Obtenir votre jeton/u });
    expect(tokenLink.getAttribute('href')).toBe('https://github.com/settings/tokens?type=beta');
    expect(tokenLink.getAttribute('target')).toBe('_blank');
    expect(tokenLink.getAttribute('rel')).toBe('noopener noreferrer');
    expect(tokenLink.getAttribute('title')).toBe('Ouvrir la page de création du jeton dans un nouvel onglet');
    expect(screen.getByText('GITHUB_TOKEN')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Se connecter à GitHub' }).textContent).toContain('Se connecter');
    expect(document.body.textContent).not.toMatch(
      /Tip:|You can also set|Token type|Access token|Get your token|Connecting|Disconnect/u,
    );

    harness.language = 'en';
    view.rerender(<ConnectionForm {...view.props} />);

    expect(screen.getByRole('form', { name: 'Connect to GitHub' })).toBeTruthy();
    expect((screen.getByLabelText('Access token') as HTMLInputElement).placeholder).toBe(
      'Enter your GitHub access token',
    );
    expect(screen.getByRole('link', { name: /Get your token/u }).getAttribute('href')).toBe(
      'https://github.com/settings/tokens?type=beta',
    );
    expect(screen.getByRole('button', { name: 'Connect to GitHub' }).textContent).toContain('Connect');
    expect(document.body.textContent).not.toMatch(/Conseil|Type de jeton|Jeton d’accès|Obtenir votre jeton/u);
  });

  it('validates an empty token accessibly and forwards technical values without trimming or translation', () => {
    const onTokenChange = vi.fn();
    const onTokenTypeChange = vi.fn();
    const onConnect = vi.fn((event: React.FormEvent) => event.preventDefault());
    const view = renderForm({ token: '', onTokenChange, onTokenTypeChange, onConnect });
    const tokenInput = screen.getByLabelText('Jeton d’accès');
    const connectButton = screen.getByRole('button', { name: 'Se connecter à GitHub' });

    expect(connectButton.hasAttribute('disabled')).toBe(true);
    expect(tokenInput.getAttribute('aria-invalid')).toBeNull();

    fireEvent.blur(tokenInput);

    const validation = screen.getByRole('alert');
    expect(validation.textContent).toBe('Saisissez un jeton d’accès pour continuer.');
    expect(tokenInput.getAttribute('aria-invalid')).toBe('true');
    expect(tokenInput.getAttribute('aria-describedby')).toContain(validation.id);

    const exactToken = '  tok_live_ABC123+/=  ';
    fireEvent.change(tokenInput, { target: { value: exactToken } });
    expect(onTokenChange).toHaveBeenCalledWith(exactToken);

    fireEvent.change(screen.getByRole('combobox', { name: 'Type de jeton' }), {
      target: { value: 'classic_token' },
    });
    expect(onTokenTypeChange).toHaveBeenCalledWith('classic_token');

    view.rerender(<ConnectionForm {...view.props} token={exactToken} />);
    expect(screen.queryByText('Saisissez un jeton d’accès pour continuer.')).toBeNull();

    fireEvent.submit(screen.getByRole('form', { name: 'Connexion à GitHub' }));
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('announces the connecting state and disables mutable fields without leaking English', () => {
    renderForm({ isConnecting: true });

    const form = screen.getByRole('form', { name: 'Connexion à GitHub' });
    const connectButton = screen.getByRole('button', { name: 'Se connecter à GitHub' });

    expect(form.getAttribute('aria-busy')).toBe('true');
    expect(connectButton.getAttribute('aria-busy')).toBe('true');
    expect(connectButton.hasAttribute('disabled')).toBe(true);
    expect(connectButton.textContent).toContain('Connexion…');
    expect(screen.getByLabelText('Jeton d’accès').hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('combobox', { name: 'Type de jeton' }).hasAttribute('disabled')).toBe(true);
    expect(document.body.textContent).not.toContain('Connecting');
  });

  it('masks raw upstream errors and renders only a localized reviewed explanation', () => {
    const rawError = 'Raw upstream English: SECRET_TOKEN=never-render provider stack trace';
    const view = renderForm({ error: new Error(rawError), errorCode: 'invalidToken' });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Échec de la connexion');
    expect(alert.textContent).toContain(
      'GitHub a refusé ce jeton. Vérifiez ses autorisations ou créez-en un nouveau, puis réessayez.',
    );
    expect(document.body.textContent).not.toContain(rawError);
    expect(alert.id).toBeTruthy();
    expect(screen.getByLabelText('Jeton d’accès').getAttribute('aria-describedby')).toContain(alert.id);

    view.rerender(<ConnectionForm {...view.props} error={rawError} errorCode={undefined} />);

    expect(screen.getByRole('alert').textContent).toContain(
      'Impossible d’établir la connexion à GitHub. Vérifiez le jeton, puis réessayez.',
    );
    expect(document.body.textContent).not.toContain(rawError);
  });

  it('renders a live connected state and switches every owned label from French to English', () => {
    const onDisconnect = vi.fn();
    const view = renderForm({ isConnected: true, onDisconnect });

    expect(screen.getByRole('status').textContent).toContain('Connecté à GitHub');

    const disconnectButton = screen.getByRole('button', { name: 'Se déconnecter de GitHub' });
    expect(disconnectButton.textContent).toContain('Se déconnecter');
    fireEvent.click(disconnectButton);
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain('Connected to');

    harness.language = 'en';
    view.rerender(<ConnectionForm {...view.props} isConnected />);

    expect(screen.getByRole('status').textContent).toContain('Connected to GitHub');
    expect(screen.getByRole('button', { name: 'Disconnect from GitHub' }).textContent).toContain('Disconnect');
    expect(document.body.textContent).not.toMatch(/Connecté à|Se déconnecter/u);
  });

  it('has zero targeted scanner findings and explicit responsive, theme, touch, and accessibility safeguards', async () => {
    const sourcePath = 'app/components/@settings/shared/service-integration/ConnectionForm.tsx';
    const source = readFileSync(sourcePath, 'utf8');
    const { scanSource } = await import('../../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, sourcePath);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).toContain('min-w-0');
    expect(source).toContain('break-words');
    expect(source).toContain('break-all');
    expect(source).toContain('w-full');
    expect(source).toContain('sm:w-auto');
    expect(source).toContain('flex-col');
    expect(source).toContain('sm:flex-row');
    expect(source).toContain('min-h-[44px]');
    expect(source).toContain('min-w-[44px]');
    expect(source).toContain('bg-bolt-elements-background');
    expect(source).toContain('bg-bolt-elements-background-depth-1');
    expect(source).toContain('text-bolt-elements-textPrimary');
    expect(source).toContain('border-bolt-elements-borderColor');
    expect(source).toContain('focus-visible:ring-2');
    expect(source).toContain('motion-reduce:transition-none');
    expect(source).toContain('motion-safe:animate-spin');
    expect(source).toContain('aria-live');
    expect(source).toContain('aria-busy');
    expect(source).toContain('aria-invalid');
    expect(source).toContain('aria-describedby');
    expect(source).toContain('aria-hidden');
    expect(source).not.toContain('truncate');
    expect(source).not.toContain('line-clamp');
    expect(source).not.toMatch(/#[0-9a-f]{3,8}/iu);
    expect(source).not.toContain('style={{');
    expect(source).not.toMatch(/>\s*\{error\}\s*</u);
  });
});
