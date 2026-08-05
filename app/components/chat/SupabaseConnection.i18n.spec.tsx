/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchSupabaseStats: vi.fn(),
  toastError: vi.fn(),
  hookResult: {} as Record<string, unknown>,
}));

vi.mock('@nanostores/react', () => ({
  useStore: () => null,
}));

vi.mock('react-toastify', () => ({
  toast: {
    error: (...args: unknown[]) => mocks.toastError(...args),
  },
}));

vi.mock('~/lib/hooks/useSupabaseConnection', () => ({
  useSupabaseConnection: () => mocks.hookResult,
}));

vi.mock('~/lib/persistence/useChatHistory', () => ({
  chatId: {},
}));

vi.mock('~/lib/stores/supabase', () => ({
  fetchSupabaseStats: (...args: unknown[]) => mocks.fetchSupabaseStats(...args),
}));

vi.mock('~/components/ui/Dialog', () => ({
  DialogRoot: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <>{children}</> : null),
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

import { SupabaseConnection } from './SupabaseConnection';
import {
  formatSupabaseConnectionCopy,
  formatSupabaseConnectionNumber,
  getSupabaseConnectionCopy,
  getSupabaseConnectionSafeError,
  supabaseConnectionEn,
  supabaseConnectionFr,
} from '~/lib/i18n/catalogs/supabase-connection';

function disconnectedHookResult() {
  return {
    connection: {
      user: null,
      token: 'sbp_user_secret',
      stats: undefined,
      selectedProjectId: undefined,
      project: undefined,
      credentials: undefined,
    },
    connecting: false,
    fetchingStats: false,
    isProjectsExpanded: false,
    setIsProjectsExpanded: vi.fn(),
    isDropdownOpen: true,
    setIsDropdownOpen: vi.fn(),
    handleConnect: vi.fn(),
    handleDisconnect: vi.fn(),
    selectProject: vi.fn(),
    handleCreateProject: vi.fn(),
    updateToken: vi.fn(),
    isConnected: false,
    fetchProjectApiKeys: vi.fn(async () => undefined),
  };
}

function connectedHookResult() {
  const project = {
    id: 'project-user-id',
    name: 'Projet utilisateur très-long-sans-traduction.example',
    region: 'eu-west-3-user-region',
    organization_id: 'organization-user-id',
    status: 'ACTIVE',
    created_at: '2026-08-04T12:00:00.000Z',
  };

  return {
    connection: {
      user: {
        id: 'user-id',
        email: 'utilisateur-avec-une-adresse-particulierement-longue@example.com',
        role: 'authenticated-user-role',
        created_at: '2026-01-01T00:00:00.000Z',
        last_sign_in_at: '2026-08-04T12:00:00.000Z',
      },
      token: 'sbp_user_secret',
      stats: { projects: [project], totalProjects: 1234 },
      selectedProjectId: project.id,
      project,
      credentials: {},
    },
    connecting: false,
    fetchingStats: false,
    isProjectsExpanded: true,
    setIsProjectsExpanded: vi.fn(),
    isDropdownOpen: true,
    setIsDropdownOpen: vi.fn(),
    handleConnect: vi.fn(),
    handleDisconnect: vi.fn(),
    selectProject: vi.fn(),
    handleCreateProject: vi.fn(),
    updateToken: vi.fn(),
    isConnected: true,
    fetchProjectApiKeys: vi.fn(async () => undefined),
  };
}

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

describe('SupabaseConnection i18n', () => {
  beforeEach(() => {
    mocks.hookResult = disconnectedHookResult();
    mocks.fetchSupabaseStats.mockReset().mockResolvedValue(undefined);
    mocks.toastError.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps strict flat catalog parity, interpolation, French numbers, and English fallback', () => {
    expect(Object.keys(supabaseConnectionFr).sort()).toEqual(Object.keys(supabaseConnectionEn).sort());

    for (const key of Object.keys(supabaseConnectionEn) as Array<keyof typeof supabaseConnectionEn>) {
      expect(supabaseConnectionEn[key].trim().length, key).toBeGreaterThan(0);
      expect(supabaseConnectionFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(supabaseConnectionFr[key]), key).toEqual(
        interpolationTokens(supabaseConnectionEn[key]),
      );
    }

    const french = getSupabaseConnectionCopy('fr-FR');

    expect(getSupabaseConnectionCopy('de-DE')['supabaseConnection.dialog.connectTitle']).toBe('Connect to Supabase');
    expect(
      formatSupabaseConnectionCopy(french['supabaseConnection.projects.heading'], {
        count: formatSupabaseConnectionNumber(1234, 'fr'),
      }),
    ).toBe('Vos projets (1 234)');
    expect(getSupabaseConnectionSafeError('fr', new Error('Raw provider error: service_role=secret'))).toBe(
      'Impossible d’actualiser les projets.',
    );
  });

  it('renders the disconnected dialog and menu trigger completely in French', () => {
    renderWithLanguage('fr', <SupabaseConnection triggerVariant="menu" />);

    expect(screen.getByRole('button', { name: 'Ouvrir la connexion Supabase' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Se connecter à Supabase' })).toBeTruthy();
    expect(screen.getByLabelText('Jeton d’accès Supabase')).toBeTruthy();
    expect(screen.getByPlaceholderText('Saisissez votre jeton d’accès Supabase')).toBeTruthy();
    expect(screen.getByText('Obtenir votre jeton')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeTruthy();
    expect(screen.queryByText('Connect to Supabase')).toBeNull();
    expect(screen.queryByText('Access Token')).toBeNull();

    const dialog = screen.getByRole('dialog');
    const tokenLink = screen.getByRole('link', { name: 'Obtenir votre jeton' });
    const connectButton = screen.getByRole('button', { name: 'Se connecter' });

    expect(dialog.className).toContain('overflow-x-hidden');
    expect(dialog.className).toContain('break-words');
    expect(tokenLink.className).toContain('min-h-11');
    expect(connectButton.className).toContain('min-h-11');
  });

  it('falls back to English for a locale without a dedicated catalog', () => {
    renderWithLanguage('es', <SupabaseConnection />);

    expect(screen.getByRole('heading', { name: 'Connect to Supabase' })).toBeTruthy();
    expect(screen.getByLabelText('Supabase access token')).toBeTruthy();
    expect(screen.queryByText('Se connecter à Supabase')).toBeNull();
  });

  it('localizes the connected state while preserving user and project data', () => {
    mocks.hookResult = connectedHookResult();
    renderWithLanguage('fr', <SupabaseConnection triggerVariant="menu" />);

    expect(screen.getByRole('heading', { name: 'Connexion Supabase' })).toBeTruthy();
    expect(screen.getByText('Rôle : authenticated-user-role')).toBeTruthy();
    expect(screen.getByText(/Vos projets \(1\s234\)/u)).toBeTruthy();
    expect(screen.getByText('Projet utilisateur très-long-sans-traduction.example')).toBeTruthy();
    expect(screen.getByText('eu-west-3-user-region')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Projet Projet utilisateur très-long-sans-traduction.example sélectionné' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Actualiser' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nouveau projet' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeTruthy();

    const projectsToggle = screen.getByRole('button', { name: 'Masquer vos projets' });
    const projectsHeader = projectsToggle.parentElement;

    expect(projectsToggle.className).toContain('min-w-0');
    expect(projectsToggle.className).toContain('min-h-11');
    expect(projectsHeader?.className).toContain('flex-col');
    expect(screen.getByRole('button', { name: 'Actualiser' }).className).toContain('min-h-11');
  });

  it('masks a raw refresh failure with locale-reviewed French copy', async () => {
    const rawError = 'Invalid JWT: service_role=raw-secret-detail';
    mocks.hookResult = connectedHookResult();
    renderWithLanguage('fr', <SupabaseConnection />);
    mocks.fetchSupabaseStats.mockRejectedValueOnce(new Error(rawError));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Impossible d’actualiser les projets.'));
    expect(document.body.textContent).not.toContain(rawError);
    expect(mocks.toastError).not.toHaveBeenCalledWith(expect.stringContaining('service_role'));
  });

  it('has zero hardcoded-copy scanner findings', async () => {
    const file = 'app/components/chat/SupabaseConnection.tsx';
    const { scanSource } = await import('../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(readFileSync(file, 'utf8'), file);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
  });
});
