/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GitHubAuthDialog } from './GitHubAuthDialog';
import {
  getGitHubAuthDialogCopy,
  getGitHubAuthDialogSafeError,
  githubAuthDialogEn,
  githubAuthDialogFr,
} from '~/lib/i18n/catalogs/github-auth-dialog';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
}));

let language = 'en';

let connectionState: {
  isConnecting: boolean;
  error: string | null;
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      ...props
    }: HTMLAttributes<HTMLDivElement> & {
      children?: ReactNode;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
    }) => <div {...props}>{children}</div>,
  },
}));

vi.mock('~/lib/hooks', () => ({
  useGitHubConnection: () => ({
    ...connectionState,
    connect: mocks.connect,
  }),
}));

const SECRET_TOKEN = 'github_pat_ProviderOwnedValue_123';

describe('GitHubAuthDialog i18n surface', () => {
  beforeEach(() => {
    language = 'en';
    connectionState = { isConnecting: false, error: null };
    mocks.connect.mockReset();
    mocks.connect.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps flat EN/FR parity, non-empty values, safe errors, and an English fallback', () => {
    expect(Object.keys(githubAuthDialogFr)).toEqual(Object.keys(githubAuthDialogEn));

    for (const key of Object.keys(githubAuthDialogEn) as (keyof typeof githubAuthDialogEn)[]) {
      expect(githubAuthDialogEn[key].trim().length, key).toBeGreaterThan(0);
      expect(githubAuthDialogFr[key].trim().length, key).toBeGreaterThan(0);
      expect(githubAuthDialogFr[key], key).not.toBe(githubAuthDialogEn[key]);
    }

    expect(getGitHubAuthDialogCopy('de-DE')['githubAuthDialog.title']).toBe('Connect to GitHub');
    expect(getGitHubAuthDialogSafeError('fr', new Error('HTTP 401 secret=private'))).toBe(
      'Impossible de connecter GitHub. Vérifiez votre jeton, puis réessayez.',
    );
  });

  it('does not render dialog content while closed', () => {
    render(<GitHubAuthDialog isOpen={false} onClose={vi.fn()} />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders complete French copy and accessible dialog semantics', () => {
    language = 'fr';

    render(<GitHubAuthDialog isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Se connecter à GitHub' })).toBeTruthy();
    expect(screen.getByText(/Utilisez un jeton d’accès personnel/u)).toBeTruthy();
    expect(screen.getByText(/Un jeton GitHub est nécessaire/u)).toBeTruthy();
    expect(screen.getByText(/Autorisations requises/u).textContent).toContain('repo, read:org, read:user');
    expect(screen.getByLabelText('Type de jeton')).toBeTruthy();

    const tokenInput = screen.getByLabelText('Jeton d’accès personnel');
    expect(tokenInput.getAttribute('placeholder')).toBe('Saisissez votre jeton d’accès personnel GitHub');
    expect(tokenInput.getAttribute('type')).toBe('password');
    expect(screen.getByRole('button', { name: 'Afficher le jeton' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fermer la fenêtre de connexion GitHub' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeTruthy();
    expect(screen.queryByText('Connect to GitHub')).toBeNull();
  });

  it('localizes fine-grained token controls while preserving GitHub URLs and scope identifiers', () => {
    language = 'fr';

    render(<GitHubAuthDialog isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Type de jeton'), { target: { value: 'fine-grained' } });

    const tokenInput = screen.getByLabelText('Jeton à granularité fine');
    expect(tokenInput.getAttribute('placeholder')).toBe('Saisissez votre jeton GitHub à granularité fine');
    expect(screen.getByRole('link', { name: 'Obtenir votre jeton' }).getAttribute('href')).toBe(
      'https://github.com/settings/tokens/beta',
    );
    expect(screen.getByText('repo, read:org, read:user')).toBeTruthy();
  });

  it('reveals the unchanged token only on explicit request and clears it on close', () => {
    language = 'fr';

    const onClose = vi.fn();

    render(<GitHubAuthDialog isOpen onClose={onClose} />);

    const tokenInput = screen.getByLabelText('Jeton d’accès personnel') as HTMLInputElement;
    fireEvent.change(tokenInput, { target: { value: SECRET_TOKEN } });
    fireEvent.click(screen.getByRole('button', { name: 'Afficher le jeton' }));

    expect(tokenInput.type).toBe('text');
    expect(tokenInput.value).toBe(SECRET_TOKEN);
    expect(screen.getByRole('button', { name: 'Masquer le jeton' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Fermer la fenêtre de connexion GitHub' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(tokenInput.value).toBe('');
    expect(tokenInput.type).toBe('password');
  });

  it('submits the exact token and type, then invokes success and close callbacks', async () => {
    language = 'fr';

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(<GitHubAuthDialog isOpen onClose={onClose} onSuccess={onSuccess} />);
    fireEvent.change(screen.getByLabelText('Type de jeton'), { target: { value: 'fine-grained' } });
    fireEvent.change(screen.getByLabelText('Jeton à granularité fine'), { target: { value: SECRET_TOKEN } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    await waitFor(() => expect(mocks.connect).toHaveBeenCalledWith(SECRET_TOKEN, 'fine-grained'));
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders a localized required-token validation and updates it on a live language switch', () => {
    language = 'fr';

    const { rerender } = render(<GitHubAuthDialog isOpen onClose={vi.fn()} />);
    const tokenInput = screen.getByLabelText('Jeton d’accès personnel');
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(screen.getByRole('alert').textContent).toBe('Saisissez votre jeton d’accès GitHub pour continuer.');
    expect(tokenInput.getAttribute('aria-invalid')).toBe('true');
    expect(tokenInput.getAttribute('aria-describedby')).toBe('github-auth-token-validation');
    expect(mocks.connect).not.toHaveBeenCalled();

    language = 'en';
    rerender(<GitHubAuthDialog isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('alert').textContent).toBe('Enter your GitHub access token to continue.');
    fireEvent.change(screen.getByLabelText('Personal Access Token'), { target: { value: 'g' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('masks both hook errors and rejected connection exceptions', async () => {
    language = 'fr';
    connectionState.error = 'HTTP 401 Bad credentials secret=github_pat_hook_private';

    const { rerender } = render(<GitHubAuthDialog isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('alert').textContent).toContain('Échec de la connexion GitHub');
    expect(screen.getByRole('alert').textContent).toContain('Impossible de connecter GitHub.');
    expect(document.body.textContent).not.toContain('github_pat_hook_private');

    connectionState.error = null;
    mocks.connect.mockRejectedValueOnce(new Error('Raw English provider failure secret=github_pat_rejected_private'));
    rerender(<GitHubAuthDialog isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Jeton d’accès personnel'), { target: { value: SECRET_TOKEN } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Impossible de connecter GitHub.'));
    expect(document.body.textContent).not.toContain('Raw English provider failure');
    expect(document.body.textContent).not.toContain('github_pat_rejected_private');
  });

  it('announces and locks the in-progress state', () => {
    language = 'fr';
    connectionState.isConnecting = true;

    render(<GitHubAuthDialog isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Connexion…' }).getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('button', { name: 'Connexion…' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Annuler' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Fermer la fenêtre de connexion GitHub' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.getByLabelText('Type de jeton').hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('Jeton d’accès personnel').hasAttribute('disabled')).toBe(true);
  });

  it('has zero scanner findings and explicit responsive, theme, accessibility, and safety safeguards', async () => {
    const sourcePath = 'app/components/@settings/tabs/github/components/GitHubAuthDialog.tsx';
    const source = readFileSync(sourcePath, 'utf8');
    const { scanSource } = await import('../../../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, sourcePath);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).toContain('w-[calc(100vw-2rem)]');
    expect(source).toContain('max-h-[calc(100dvh-2rem)]');
    expect(source).toContain('sm:flex-row');
    expect(source).toContain('min-h-11');
    expect(source).toContain('dark:');
    expect(source).toContain('Dialog.Title');
    expect(source).toContain('Dialog.Description');
    expect(source).toContain('role="alert"');
    expect(source).not.toContain('>{error}<');
    expect(source).not.toContain('error.message');
    expect(source).toContain('await connect(token, tokenType)');
    expect(source).toContain('GITHUB_TOKEN_URLS[tokenType]');
  });
});
