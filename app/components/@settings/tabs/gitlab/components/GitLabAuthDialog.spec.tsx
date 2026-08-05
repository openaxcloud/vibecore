/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GitLabAuthDialog } from './GitLabAuthDialog';
import {
  getGitLabAuthDialogCopy,
  getGitLabAuthDialogSafeError,
  gitLabAuthDialogEn,
  gitLabAuthDialogFr,
} from '~/lib/i18n/catalogs/gitlab-auth-dialog';

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
      transition: _transition,
      ...props
    }: HTMLAttributes<HTMLDivElement> & {
      children?: ReactNode;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => <div {...props}>{children}</div>,
  },
}));

vi.mock('~/lib/hooks', () => ({
  useGitLabConnection: () => ({
    ...connectionState,
    connect: mocks.connect,
  }),
}));

const SECRET_TOKEN = 'glpat-ProviderOwnedValue_123456';

describe('GitLabAuthDialog i18n surface', () => {
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
    expect(Object.keys(gitLabAuthDialogFr)).toEqual(Object.keys(gitLabAuthDialogEn));

    for (const key of Object.keys(gitLabAuthDialogEn) as (keyof typeof gitLabAuthDialogEn)[]) {
      expect(gitLabAuthDialogEn[key].trim().length, key).toBeGreaterThan(0);
      expect(gitLabAuthDialogFr[key].trim().length, key).toBeGreaterThan(0);

      if (key !== 'gitLabAuthDialog.url.placeholder') {
        expect(gitLabAuthDialogFr[key], key).not.toBe(gitLabAuthDialogEn[key]);
      }
    }

    expect(getGitLabAuthDialogCopy('de-DE')['gitLabAuthDialog.title']).toBe('Connect to GitLab');
    expect(getGitLabAuthDialogSafeError('fr', new Error('HTTP 401 secret=private'))).toBe(
      'Impossible de connecter GitLab. Vérifiez l’URL et le jeton, puis réessayez.',
    );
  });

  it('does not render dialog content while closed', () => {
    render(<GitLabAuthDialog isOpen={false} onClose={vi.fn()} />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders complete French copy and accessible dialog semantics', () => {
    language = 'fr';

    render(<GitLabAuthDialog isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Se connecter à GitLab' })).toBeTruthy();
    expect(screen.getByText('Connectez votre compte GitLab pour déployer vos projets depuis E-Code.')).toBeTruthy();
    expect(screen.getByText(/instance GitLab auto-hébergée/u)).toBeTruthy();
    expect(screen.getByText(/Autorisations requises/u).textContent).toContain('api, read_repository');

    const urlInput = screen.getByLabelText('URL GitLab');
    expect(urlInput.getAttribute('value')).toBe('https://gitlab.com');
    expect(urlInput.getAttribute('placeholder')).toBe('https://gitlab.com');

    const tokenInput = screen.getByLabelText('Jeton d’accès');
    expect(tokenInput.getAttribute('placeholder')).toBe('Saisissez votre jeton d’accès GitLab');
    expect(tokenInput.getAttribute('type')).toBe('password');
    expect(screen.getByRole('button', { name: 'Afficher le jeton' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fermer la fenêtre de connexion GitLab' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Se connecter à GitLab' })).toBeTruthy();
    expect(screen.queryByText('Connect to GitLab')).toBeNull();
  });

  it('preserves a self-hosted URL, token, settings URL, and scope identifiers', async () => {
    language = 'fr';

    const customUrl = 'https://gitlab.acme.test/platform';
    const expectedSettingsUrl = 'https://gitlab.acme.test/platform/-/user_settings/personal_access_tokens';
    const onClose = vi.fn();

    render(<GitLabAuthDialog isOpen onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('URL GitLab'), { target: { value: customUrl } });
    fireEvent.change(screen.getByLabelText('Jeton d’accès'), { target: { value: SECRET_TOKEN } });

    expect(screen.getByRole('link', { name: 'Obtenir votre jeton' }).getAttribute('href')).toBe(expectedSettingsUrl);
    expect(screen.getByText('api, read_repository')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Se connecter à GitLab' }));

    await waitFor(() => expect(mocks.connect).toHaveBeenCalledWith(SECRET_TOKEN, customUrl));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('reveals the unchanged token only on explicit request and clears it on close', () => {
    language = 'fr';

    const onClose = vi.fn();

    render(<GitLabAuthDialog isOpen onClose={onClose} />);

    const tokenInput = screen.getByLabelText('Jeton d’accès') as HTMLInputElement;
    fireEvent.change(tokenInput, { target: { value: SECRET_TOKEN } });
    fireEvent.click(screen.getByRole('button', { name: 'Afficher le jeton' }));

    expect(tokenInput.type).toBe('text');
    expect(tokenInput.value).toBe(SECRET_TOKEN);
    expect(screen.getByRole('button', { name: 'Masquer le jeton' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Fermer la fenêtre de connexion GitLab' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(tokenInput.value).toBe('');
    expect(tokenInput.type).toBe('password');
  });

  it('validates missing fields in French and updates active errors on a live language switch', () => {
    language = 'fr';

    const { rerender } = render(<GitLabAuthDialog isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('URL GitLab'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter à GitLab' }));

    expect(screen.getByText('Saisissez votre URL GitLab pour continuer.')).toBeTruthy();
    expect(screen.getByText('Saisissez votre jeton d’accès GitLab pour continuer.')).toBeTruthy();
    expect(screen.getByLabelText('URL GitLab').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Jeton d’accès').getAttribute('aria-invalid')).toBe('true');
    expect(mocks.connect).not.toHaveBeenCalled();

    language = 'en';
    rerender(<GitLabAuthDialog isOpen onClose={vi.fn()} />);

    expect(screen.getByText('Enter your GitLab URL to continue.')).toBeTruthy();
    expect(screen.getByText('Enter your GitLab access token to continue.')).toBeTruthy();
  });

  it('rejects non-HTTP GitLab URLs and never exposes an unsafe token-settings link', () => {
    language = 'fr';

    render(<GitLabAuthDialog isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('URL GitLab'), { target: { value: 'javascript:alert(1)' } });
    fireEvent.change(screen.getByLabelText('Jeton d’accès'), { target: { value: SECRET_TOKEN } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter à GitLab' }));

    expect(screen.getByText('Saisissez une URL GitLab HTTP ou HTTPS valide.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Obtenir votre jeton' })).toBeNull();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('masks both hook errors and rejected connection exceptions', async () => {
    language = 'fr';
    connectionState.error = 'HTTP 401 Invalid token secret=glpat-hook-private';

    const { rerender } = render(<GitLabAuthDialog isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('alert').textContent).toContain('Échec de la connexion GitLab');
    expect(screen.getByRole('alert').textContent).toContain('Impossible de connecter GitLab.');
    expect(document.body.textContent).not.toContain('glpat-hook-private');

    connectionState.error = null;
    mocks.connect.mockRejectedValueOnce(new Error('Raw English provider failure secret=glpat-rejected-private'));
    rerender(<GitLabAuthDialog isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Jeton d’accès'), { target: { value: SECRET_TOKEN } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter à GitLab' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Impossible de connecter GitLab.'));
    expect(document.body.textContent).not.toContain('Raw English provider failure');
    expect(document.body.textContent).not.toContain('glpat-rejected-private');
  });

  it('announces and locks the in-progress state', () => {
    language = 'fr';
    connectionState.isConnecting = true;

    render(<GitLabAuthDialog isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Connexion…' }).getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('button', { name: 'Connexion…' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Annuler' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Fermer la fenêtre de connexion GitLab' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.getByLabelText('URL GitLab').hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('Jeton d’accès').hasAttribute('disabled')).toBe(true);
  });

  it('has zero scanner findings and explicit responsive, theme, accessibility, and safety safeguards', async () => {
    const sourcePath = 'app/components/@settings/tabs/gitlab/components/GitLabAuthDialog.tsx';
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
    expect(source).not.toContain('console.error');
    expect(source).not.toContain('toast.');
    expect(source).toContain('await connect(token, normalizedUrl)');
    expect(source).toContain('GITLAB_TOKEN_SETTINGS_PATH');
  });
});
