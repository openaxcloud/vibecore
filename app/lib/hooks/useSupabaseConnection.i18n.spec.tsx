/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSupabaseConnection } from './useSupabaseConnection';
import type { SupabaseConnectionState } from '~/lib/stores/supabase';

const mocks = vi.hoisted(() => ({
  connectionStore: { get: vi.fn() },
  connectingStore: { set: vi.fn() },
  fetchingStatsStore: {},
  fetchingApiKeysStore: {},
  connection: {} as Record<string, unknown>,
  updateConnection: vi.fn(),
  fetchProjectApiKeys: vi.fn(),
  initializeConnection: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@nanostores/react', () => ({
  useStore: (store: unknown) => {
    if (store === mocks.connectionStore) {
      return mocks.connection;
    }

    return false;
  },
}));

vi.mock('react-toastify', () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
    error: (...args: unknown[]) => mocks.toastError(...args),
  },
}));

vi.mock('~/lib/stores/logs', () => ({
  logStore: {
    logError: (...args: unknown[]) => mocks.logError(...args),
  },
}));

vi.mock('~/lib/stores/supabase', () => ({
  supabaseConnection: mocks.connectionStore,
  isConnecting: mocks.connectingStore,
  isFetchingStats: mocks.fetchingStatsStore,
  isFetchingApiKeys: mocks.fetchingApiKeysStore,
  updateSupabaseConnection: (...args: unknown[]) => mocks.updateConnection(...args),
  fetchProjectApiKeys: (...args: unknown[]) => mocks.fetchProjectApiKeys(...args),
  initializeSupabaseConnection: (...args: unknown[]) => mocks.initializeConnection(...args),
}));

const baseConnection: SupabaseConnectionState = {
  user: null,
  token: '  sbp_user_token  ',
  stats: undefined,
  selectedProjectId: undefined,
  credentials: undefined,
};

function renderConnectionHook(language: 'en' | 'fr' | 'es', connection = baseConnection) {
  mocks.connection = connection;

  const i18n = createInstance();

  void i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr', 'es'],
    resources: { en: { translation: {} }, fr: { translation: {} }, es: { translation: {} } },
    initImmediate: false,
  });

  const wrapper = ({ children }: { children: ReactNode }) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;

  return renderHook(() => useSupabaseConnection(), { wrapper });
}

function successfulPayload() {
  return {
    user: {
      id: 'organization-user-id',
      email: 'User Supabase organization',
      role: 'pro plan',
      created_at: '2026-01-01T00:00:00.000Z',
      last_sign_in_at: '2026-08-04T12:00:00.000Z',
    },
    stats: {
      projects: [],
      totalProjects: 0,
    },
  };
}

describe('useSupabaseConnection i18n', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.connection = { ...baseConnection };
    mocks.connectionStore.get.mockReset().mockImplementation(() => mocks.connection);
    mocks.connectingStore.set.mockReset();
    mocks.updateConnection.mockReset().mockImplementation((patch: Record<string, unknown>) => {
      mocks.connection = { ...mocks.connection, ...patch };
    });
    mocks.fetchProjectApiKeys.mockReset().mockResolvedValue(undefined);
    mocks.initializeConnection.mockReset().mockResolvedValue(undefined);
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.logError.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('connects with a trimmed token and announces success in French', async () => {
    const payload = successfulPayload();
    const responseJson = vi.fn(async () => payload);
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: responseJson }));

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderConnectionHook('fr');

    let connected = false;

    await act(async () => {
      connected = await result.current.handleConnect();
    });

    expect(connected).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/supabase',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'sbp_user_token' }),
      }),
    );
    expect(responseJson).toHaveBeenCalledTimes(1);
    expect(mocks.updateConnection).toHaveBeenCalledWith({
      user: payload.user,
      token: baseConnection.token,
      stats: payload.stats,
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Connexion à Supabase réussie.');
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.connectingStore.set.mock.calls).toEqual([[true], [false]]);
    expect(result.current.isProjectsExpanded).toBe(true);
  });

  it('does not parse or surface a raw authentication response', async () => {
    const rawError = 'Invalid JWT service_role=raw-secret-from-provider';
    const responseJson = vi.fn(async () => ({ error: rawError }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401, json: responseJson })),
    );

    const { result } = renderConnectionHook('fr');

    let connected = true;

    await act(async () => {
      connected = await result.current.handleConnect();
    });

    expect(connected).toBe(false);
    expect(responseJson).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      'Impossible de se connecter à Supabase. Vérifiez votre jeton d’accès, puis réessayez.',
    );
    expect(mocks.toastError).not.toHaveBeenCalledWith(expect.stringContaining('service_role'));
    expect(mocks.logError).toHaveBeenCalledWith('Supabase authentication failed', undefined, { statusCode: 401 });
    expect(mocks.updateConnection).toHaveBeenCalledWith({ user: null, token: '' });
    expect(JSON.stringify(mocks.logError.mock.calls)).not.toContain(rawError);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(rawError);
  });

  it('uses the reviewed English fallback for network and malformed-payload failures', async () => {
    const rawNetworkError = 'fetch failed with token sbp_raw_secret';

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error(rawNetworkError))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ error: 'Unexpected raw success shape' }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderConnectionHook('es');
    const outcomes: boolean[] = [];

    await act(async () => {
      outcomes.push(await result.current.handleConnect());
      outcomes.push(await result.current.handleConnect());
    });

    expect(outcomes).toEqual([false, false]);
    expect(mocks.toastError).toHaveBeenNthCalledWith(
      1,
      'Could not connect to Supabase. Check your access token and try again.',
    );
    expect(mocks.toastError).toHaveBeenNthCalledWith(
      2,
      'Could not connect to Supabase. Check your access token and try again.',
    );
    expect(JSON.stringify(mocks.toastError.mock.calls)).not.toContain(rawNetworkError);
    expect(JSON.stringify(mocks.logError.mock.calls)).not.toContain(rawNetworkError);
  });

  it('localizes disconnect and project-selection outcomes without leaking provider errors', async () => {
    const rawKeyError = 'Supabase API key response included service_role=raw-secret';

    const project = {
      id: 'project-id',
      name: 'User-owned project',
      region: 'eu-west-3',
      organization_id: 'organization-id',
      status: 'ACTIVE',
      created_at: '2026-01-01T00:00:00.000Z',
    };
    const connection: SupabaseConnectionState = {
      ...baseConnection,
      token: 'sbp_user_token',
      stats: { projects: [project], totalProjects: 1 },
    };

    const { result } = renderConnectionHook('fr', connection);

    await act(async () => result.current.selectProject(project.id));
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Projet sélectionné.');

    mocks.fetchProjectApiKeys.mockRejectedValueOnce(new Error(rawKeyError));
    await act(async () => result.current.selectProject(project.id));

    expect(mocks.toastError).toHaveBeenCalledWith(
      'Le projet est sélectionné, mais ses clés API n’ont pas pu être récupérées. Réessayez.',
    );
    expect(JSON.stringify(mocks.toastError.mock.calls)).not.toContain(rawKeyError);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(rawKeyError);

    act(() => result.current.handleDisconnect());
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Déconnexion de Supabase réussie.');
  });

  it('returns a safe localized missing-token error', async () => {
    const { result } = renderConnectionHook('fr', { ...baseConnection, token: '' });

    await expect(result.current.fetchProjectApiKeys('project-id')).rejects.toThrow(
      'Un jeton d’accès Supabase est requis.',
    );
  });

  it('has zero hardcoded-copy scanner findings', async () => {
    const file = 'app/lib/hooks/useSupabaseConnection.ts';
    const { scanSource } = await import('../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(readFileSync(file, 'utf8'), file);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
  });

  it('initializes the existing persisted-connection flow', async () => {
    renderConnectionHook('fr');

    await waitFor(() => expect(mocks.initializeConnection).toHaveBeenCalledTimes(1));
  });
});
