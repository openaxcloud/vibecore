/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { act, cleanup, renderHook } from '@testing-library/react';
import { createInstance } from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  netlifyStore: {},
  vercelStore: {},
  chatStore: {},
  netlifyConnection: { user: { id: 'netlify-user' }, token: 'netlify-token' } as {
    user: { id: string } | null;
    token: string;
  },
  vercelConnection: { user: { id: 'vercel-user' }, token: 'vercel-token' } as {
    user: { id: string } | null;
    token: string;
  },
  currentChatId: 'chat-id' as string | undefined,
  artifact: {
    id: 'artifact-id',
    runner: {
      addAction: vi.fn(),
      runAction: vi.fn(),
      buildOutput: { exitCode: 0, path: '/workspace/dist', output: 'Build complete' } as
        | { exitCode: number; path: string; output: string }
        | undefined,
    },
  } as
    | {
        id: string;
        runner: {
          addAction: ReturnType<typeof vi.fn>;
          runAction: ReturnType<typeof vi.fn>;
          buildOutput: { exitCode: number; path: string; output: string } | undefined;
        };
      }
    | undefined,
  deployRunner: { handleDeployAction: vi.fn() },
  addArtifact: vi.fn(),
  artifactsGet: vi.fn(),
  directoryExists: vi.fn(),
  collectFiles: vi.fn(),
  pollNetlify: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@nanostores/react', () => ({
  useStore: (store: unknown) => {
    if (store === harness.netlifyStore) {
      return harness.netlifyConnection;
    }

    if (store === harness.vercelStore) {
      return harness.vercelConnection;
    }

    if (store === harness.chatStore) {
      return harness.currentChatId;
    }

    return undefined;
  },
}));

vi.mock('react-toastify', () => ({
  toast: {
    error: (...args: unknown[]) => harness.toastError(...args),
    info: (...args: unknown[]) => harness.toastInfo(...args),
    success: (...args: unknown[]) => harness.toastSuccess(...args),
  },
}));

vi.mock('~/lib/persistence/useChatHistory', () => ({ chatId: harness.chatStore }));
vi.mock('~/lib/runtime/RuntimeAdapterProvider', () => ({
  useRuntimeAdapter: () => ({ workdir: '/workspace' }),
}));
vi.mock('~/lib/runtime/runtime-files', () => ({
  collectRuntimeTextFiles: (...args: unknown[]) => harness.collectFiles(...args),
  runtimeDirectoryExists: (...args: unknown[]) => harness.directoryExists(...args),
}));
vi.mock('~/lib/stores/netlify', () => ({ netlifyConnection: harness.netlifyStore }));
vi.mock('~/lib/stores/vercel', () => ({ vercelConnection: harness.vercelStore }));
vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    get firstArtifact() {
      return harness.artifact;
    },
    addArtifact: (...args: unknown[]) => harness.addArtifact(...args),
    artifacts: { get: () => harness.artifactsGet() },
  },
}));
vi.mock('./netlify-deploy-poll', () => ({
  pollNetlifyDeploy: (...args: unknown[]) => harness.pollNetlify(...args),
}));

import { useNetlifyDeploy } from './NetlifyDeploy.client';
import { useVercelDeploy } from './VercelDeploy.client';
import {
  deploySurfacesEn,
  deploySurfacesFr,
  getDeploySurfacesCopy,
  getDeploySurfaceStatusCopy,
} from '~/lib/i18n/catalogs/deploy-surfaces';

function renderDeployHook<T>(language: string, useDeployHook: () => T) {
  const i18n = createInstance();

  void i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr', 'es'],
    resources: { en: { translation: {} }, fr: { translation: {} }, es: { translation: {} } },
    initImmediate: false,
  });

  const wrapper = ({ children }: { children: ReactNode }) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;

  return { ...renderHook(useDeployHook, { wrapper }), i18n };
}

describe('Netlify and Vercel deployment surface i18n', () => {
  beforeEach(() => {
    localStorage.clear();
    harness.netlifyConnection = { user: { id: 'netlify-user' }, token: 'netlify-token' };
    harness.vercelConnection = { user: { id: 'vercel-user' }, token: 'vercel-token' };
    harness.currentChatId = 'chat-id';
    harness.artifact = {
      id: 'artifact-id',
      runner: {
        addAction: vi.fn(),
        runAction: vi.fn().mockResolvedValue(undefined),
        buildOutput: { exitCode: 0, path: '/workspace/dist', output: 'Build complete' },
      },
    };
    harness.deployRunner.handleDeployAction.mockReset();
    harness.addArtifact.mockReset();
    harness.artifactsGet.mockReset().mockReturnValue({
      'deploy-artifact': { runner: harness.deployRunner },
      'deploy-vercel-project': { runner: harness.deployRunner },
    });
    harness.directoryExists.mockReset().mockResolvedValue(true);
    harness.collectFiles.mockReset().mockResolvedValue({ 'index.html': '<main>E-Code</main>' });
    harness.pollNetlify.mockReset().mockResolvedValue({
      outcome: 'ready',
      attempts: 1,
      status: { ssl_url: 'https://site.netlify.app' },
    });
    harness.toastError.mockReset();
    harness.toastInfo.mockReset();
    harness.toastSuccess.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps flat English and French catalogs aligned and falls back to English', () => {
    expect(Object.keys(deploySurfacesFr)).toEqual(Object.keys(deploySurfacesEn));
    expect(getDeploySurfacesCopy('es')['deploySurfaces.status.building']).toBe('Building the project…');
    expect(getDeploySurfaceStatusCopy(getDeploySurfacesCopy('fr'), 'building')).toBe('Compilation du projet…');
  });

  it('switches missing-connection copy live without remounting the hooks', async () => {
    harness.netlifyConnection = { user: null, token: '' };
    harness.vercelConnection = { user: null, token: '' };

    const netlify = renderDeployHook('fr', useNetlifyDeploy);
    const vercel = renderDeployHook('fr', useVercelDeploy);

    await act(async () => {
      expect(await netlify.result.current.handleNetlifyDeploy()).toBe(false);
      expect(await vercel.result.current.handleVercelDeploy()).toBe(false);
    });

    expect(harness.toastError).toHaveBeenNthCalledWith(
      1,
      'Connectez votre compte Netlify dans les paramètres avant de lancer le déploiement.',
    );
    expect(harness.toastError).toHaveBeenNthCalledWith(
      2,
      'Connectez votre compte Vercel dans les paramètres avant de lancer le déploiement.',
    );

    await act(async () => {
      await netlify.i18n.changeLanguage('en');
      await vercel.i18n.changeLanguage('en');
    });
    await act(async () => {
      expect(await netlify.result.current.handleNetlifyDeploy()).toBe(false);
      expect(await vercel.result.current.handleVercelDeploy()).toBe(false);
    });

    expect(harness.toastError).toHaveBeenNthCalledWith(3, 'Connect your Netlify account in Settings before deploying.');
    expect(harness.toastError).toHaveBeenNthCalledWith(4, 'Connect your Vercel account in Settings before deploying.');
    expect(netlify.result.current.statusMessage).toBe('The deployment could not be completed.');
    expect(vercel.result.current.statusMessage).toBe('The deployment could not be completed.');
  });

  it('logs a raw Netlify API failure but only surfaces reviewed French copy', async () => {
    const rawProviderError = 'upstream token=netlify-secret request_id=req-123';

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 502,
        json: async () => ({ error: rawProviderError }),
      })),
    );

    const { result } = renderDeployHook('fr', useNetlifyDeploy);

    await act(async () => {
      expect(await result.current.handleNetlifyDeploy()).toBe(false);
    });

    expect(harness.toastError).toHaveBeenCalledWith(
      'Le service de déploiement a renvoyé une réponse inattendue. Veuillez réessayer.',
    );
    expect(JSON.stringify(harness.toastError.mock.calls)).not.toContain(rawProviderError);
    expect(JSON.stringify(harness.deployRunner.handleDeployAction.mock.calls)).not.toContain(rawProviderError);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).toContain(rawProviderError);
    expect(result.current.isDeploying).toBe(false);
    expect(result.current.deploymentStatus).toBe('error');
    expect(result.current.statusMessage).toBe('Le déploiement n’a pas pu être terminé.');
  });

  it('announces a pending Vercel deployment in French and preserves provider IDs and URLs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 202,
        json: async () => ({
          deploy: { url: 'https://project.vercel.app' },
          project: { id: 'vercel-project-id' },
          pending: true,
        }),
      })),
    );

    const { result } = renderDeployHook('fr', useVercelDeploy);

    await act(async () => {
      expect(await result.current.handleVercelDeploy()).toBe(true);
    });

    expect(harness.addArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'deploy-vercel-project', title: 'Déploiement Vercel' }),
    );
    expect(harness.toastInfo).toHaveBeenCalledWith(
      'Votre déploiement Vercel est toujours en cours. Consultez le tableau de bord Vercel pour connaître son état final.',
    );
    expect(localStorage.getItem('vercel-project-chat-id')).toBe('vercel-project-id');
    expect(result.current.isDeploying).toBe(false);
    expect(result.current.deploymentStatus).toBe('pending');
    expect(result.current.statusMessage).toBe('Le déploiement est toujours en cours.');
  });

  it('announces a successful Netlify deployment in French and preserves its live URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ deploy: { id: 'deploy-id' }, site: { id: 'site-id' } }),
      })),
    );

    const { result } = renderDeployHook('fr', useNetlifyDeploy);

    await act(async () => {
      expect(await result.current.handleNetlifyDeploy()).toBe(true);
    });

    expect(harness.addArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'deploy-artifact', title: 'Déploiement Netlify' }),
    );
    expect(harness.deployRunner.handleDeployAction).toHaveBeenLastCalledWith('complete', 'complete', {
      url: 'https://site.netlify.app',
      source: 'netlify',
    });
    expect(harness.toastSuccess).toHaveBeenCalledWith('🚀 Déploiement Netlify terminé avec succès.');
    expect(localStorage.getItem('netlify-site-chat-id')).toBe('site-id');
    expect(result.current.deploymentStatus).toBe('success');
    expect(result.current.statusMessage).toBe('Déploiement terminé avec succès.');
  });

  it('has zero hardcoded-copy scanner findings in both deployment hooks', async () => {
    const { scanSource } = await import('../../../scripts/i18n/source-scanner.mjs');

    for (const file of [
      'app/components/deploy/NetlifyDeploy.client.tsx',
      'app/components/deploy/VercelDeploy.client.tsx',
    ]) {
      const result = scanSource(readFileSync(file, 'utf8'), file);

      expect(result.parseErrors, file).toEqual([]);
      expect(result.findings, file).toEqual([]);
    }
  });
});
