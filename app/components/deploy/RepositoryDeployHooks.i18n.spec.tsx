/** @vitest-environment jsdom */

import { act, cleanup, renderHook } from '@testing-library/react';
import { createInstance } from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  chatStore: {},
  currentChatId: 'chat-id' as string | undefined,
  artifact: {
    id: 'artifact-id',
    title: 'Customer Portal',
    runner: {
      addAction: vi.fn(),
      runAction: vi.fn(),
      buildOutput: { exitCode: 0, output: 'Build complete' } as { exitCode: number; output: string } | undefined,
    },
  } as
    | {
        id: string;
        title?: string;
        runner: {
          addAction: ReturnType<typeof vi.fn>;
          runAction: ReturnType<typeof vi.fn>;
          buildOutput: { exitCode: number; output: string } | undefined;
        };
      }
    | undefined,
  deployRunner: { handleDeployAction: vi.fn() },
  addArtifact: vi.fn(),
  collectFiles: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@nanostores/react', () => ({
  useStore: (store: unknown) => (store === harness.chatStore ? harness.currentChatId : undefined),
}));

vi.mock('react-toastify', () => ({
  toast: {
    error: (...args: unknown[]) => harness.toastError(...args),
    success: (...args: unknown[]) => harness.toastSuccess(...args),
  },
}));

vi.mock('~/lib/persistence/useChatHistory', () => ({ chatId: harness.chatStore }));
vi.mock('~/lib/runtime/RuntimeAdapterProvider', () => ({
  useRuntimeAdapter: () => ({ workdir: '/workspace' }),
}));
vi.mock('~/lib/runtime/runtime-files', () => ({
  collectRuntimeTextFiles: (...args: unknown[]) => harness.collectFiles(...args),
}));
vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    get firstArtifact() {
      return harness.artifact;
    },
    addArtifact: (...args: unknown[]) => harness.addArtifact(...args),
    artifacts: {
      get: () => ({
        'deploy-github-project': { runner: harness.deployRunner },
        'deploy-gitlab-project': { runner: harness.deployRunner },
      }),
    },
  },
}));

import { useGitHubDeploy } from './GitHubDeploy.client';
import { useGitLabDeploy } from './GitLabDeploy.client';

function renderDeployHook<Result>(language: 'en' | 'fr', hook: () => Result) {
  const i18n = createInstance();

  void i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr'],
    resources: { en: { translation: {} }, fr: { translation: {} } },
    initImmediate: false,
  });

  const wrapper = ({ children }: { children: ReactNode }) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;

  return { i18n, ...renderHook(hook, { wrapper }) };
}

function connect(provider: 'github' | 'gitlab') {
  localStorage.setItem(
    `${provider}_connection`,
    JSON.stringify({ token: `${provider}-token-value`, user: { id: `${provider}-user` } }),
  );
}

describe('GitHub and GitLab deployment preparation i18n', () => {
  beforeEach(() => {
    localStorage.clear();
    harness.currentChatId = 'chat-id';
    harness.artifact = {
      id: 'artifact-id',
      title: 'Customer Portal',
      runner: {
        addAction: vi.fn(),
        runAction: vi.fn().mockResolvedValue(undefined),
        buildOutput: { exitCode: 0, output: 'Build complete' },
      },
    };
    harness.deployRunner.handleDeployAction.mockReset();
    harness.addArtifact.mockReset();
    harness.collectFiles.mockReset().mockResolvedValue({
      'src/main.ts': 'export const greeting = "Hello from user code";',
    });
    harness.toastError.mockReset();
    harness.toastSuccess.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('switches connection guidance and status copy live without remounting', async () => {
    const github = renderDeployHook('fr', useGitHubDeploy);

    await act(async () => {
      expect(await github.result.current.handleGitHubDeploy()).toBe(false);
    });

    expect(harness.toastError).toHaveBeenLastCalledWith(
      'Connectez votre compte GitHub dans Paramètres > Connexions avant de lancer le déploiement.',
    );
    expect(github.result.current.statusMessage).toBe('La préparation du déploiement a échoué.');

    await act(async () => {
      await github.i18n.changeLanguage('en');
    });

    expect(github.result.current.statusMessage).toBe('Deployment preparation failed.');

    await act(async () => {
      expect(await github.result.current.handleGitHubDeploy()).toBe(false);
    });

    expect(harness.toastError).toHaveBeenLastCalledWith(
      'Connect your GitHub account in Settings > Connections before deploying.',
    );
  });

  it('keeps raw build diagnostics in logs and only emits reviewed French copy', async () => {
    const rawDiagnostic = 'upstream token=repository-secret request_id=req-98';

    connect('github');
    harness.artifact!.runner.buildOutput = { exitCode: 1, output: rawDiagnostic };

    const github = renderDeployHook('fr', useGitHubDeploy);

    await act(async () => {
      expect(await github.result.current.handleGitHubDeploy()).toBe(false);
    });

    expect(harness.deployRunner.handleDeployAction).toHaveBeenLastCalledWith('building', 'failed', {
      error:
        'La compilation du projet a échoué. Consultez la sortie du terminal, corrigez les erreurs, puis réessayez.',
      source: 'github',
    });
    expect(harness.toastError).toHaveBeenLastCalledWith(
      'La compilation du projet a échoué. Consultez la sortie du terminal, corrigez les erreurs, puis réessayez.',
    );
    expect(JSON.stringify(harness.deployRunner.handleDeployAction.mock.calls)).not.toContain(rawDiagnostic);
    expect(JSON.stringify(harness.toastError.mock.calls)).not.toContain(rawDiagnostic);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).toContain(rawDiagnostic);
    expect(github.result.current.deploymentStatus).toBe('error');
    expect(github.result.current.isDeploying).toBe(false);
  });

  it('prepares GitHub and GitLab deployments in French without changing commands, files, or project names', async () => {
    connect('github');
    connect('gitlab');

    const github = renderDeployHook('fr', useGitHubDeploy);
    const gitlab = renderDeployHook('fr', useGitLabDeploy);

    let githubResult: Awaited<ReturnType<typeof github.result.current.handleGitHubDeploy>>;
    let gitlabResult: Awaited<ReturnType<typeof gitlab.result.current.handleGitLabDeploy>>;

    await act(async () => {
      githubResult = await github.result.current.handleGitHubDeploy();
      gitlabResult = await gitlab.result.current.handleGitLabDeploy();
    });

    expect(harness.addArtifact).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'deploy-github-project', title: 'Déploiement GitHub' }),
    );
    expect(harness.addArtifact).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: 'deploy-gitlab-project', title: 'Déploiement GitLab' }),
    );
    expect(harness.artifact!.runner.addAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: { type: 'build', content: 'npm run build' } }),
    );
    expect(githubResult!).toEqual({
      success: true,
      files: { 'src/main.ts': 'export const greeting = "Hello from user code";' },
      projectName: 'Customer Portal',
    });
    expect(gitlabResult!).toEqual(githubResult!);
    expect(harness.toastSuccess).toHaveBeenNthCalledWith(
      1,
      '🚀 Préparation du déploiement GitHub terminée avec succès.',
    );
    expect(harness.toastSuccess).toHaveBeenNthCalledWith(
      2,
      '🚀 Préparation du déploiement GitLab terminée avec succès.',
    );
    expect(github.result.current.statusMessage).toBe('Préparation du déploiement terminée avec succès.');
    expect(gitlab.result.current.statusMessage).toBe('Préparation du déploiement terminée avec succès.');
  });

  it('uses safe localized fallbacks for unknown collection failures', async () => {
    connect('gitlab');
    harness.collectFiles.mockRejectedValueOnce(new Error('filesystem bearer=secret-value'));

    const gitlab = renderDeployHook('fr', useGitLabDeploy);

    await act(async () => {
      expect(await gitlab.result.current.handleGitLabDeploy()).toBe(false);
    });

    expect(harness.toastError).toHaveBeenLastCalledWith('Impossible de terminer la préparation du déploiement GitLab.');
    expect(JSON.stringify(harness.toastError.mock.calls)).not.toContain('bearer=secret-value');
    expect(
      vi
        .mocked(console.error)
        .mock.calls.flat()
        .some((value) => value instanceof Error && value.message.includes('bearer=secret-value')),
    ).toBe(true);
  });
});
