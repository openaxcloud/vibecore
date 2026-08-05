/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  netlifyStore: {},
  vercelStore: {},
  gitlabStore: {},
  streamingStore: {},
  previewsStore: {},
  netlifyConnection: { user: { id: 'netlify-user' } } as { user: { id: string } | null },
  vercelConnection: { user: { id: 'vercel-user' } } as { user: { id: string } | null },
  gitlabConnected: true,
  streaming: false,
  previews: [{ port: 5173 }],
  toastError: vi.fn(),
  githubDeploy: vi.fn(),
  gitlabDeploy: vi.fn(),
  netlifyDeploy: vi.fn(),
  vercelDeploy: vi.fn(),
}));

vi.mock('@radix-ui/react-dropdown-menu', async () => {
  const React = await import('react');

  return {
    Root: ({ children }: { children?: ReactNode }) => React.createElement(React.Fragment, null, children),
    Trigger: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button type="button" {...props}>
        {children}
      </button>
    ),
    Content: ({ children, className }: HTMLAttributes<HTMLDivElement>) => <div className={className}>{children}</div>,
    Item: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button type="button" {...props}>
        {children}
      </button>
    ),
  };
});

vi.mock('@nanostores/react', () => ({
  useStore: (store: unknown) => {
    if (store === harness.netlifyStore) {
      return harness.netlifyConnection;
    }

    if (store === harness.vercelStore) {
      return harness.vercelConnection;
    }

    if (store === harness.gitlabStore) {
      return harness.gitlabConnected;
    }

    if (store === harness.streamingStore) {
      return harness.streaming;
    }

    if (store === harness.previewsStore) {
      return harness.previews;
    }

    return undefined;
  },
}));

vi.mock('react-toastify', () => ({
  toast: { error: (...args: unknown[]) => harness.toastError(...args) },
}));
vi.mock('~/components/chat/NetlifyDeploymentLink.client', () => ({ NetlifyDeploymentLink: () => null }));
vi.mock('~/components/chat/VercelDeploymentLink.client', () => ({ VercelDeploymentLink: () => null }));
vi.mock('~/components/deploy/GitHubDeploy.client', () => ({
  useGitHubDeploy: () => ({ handleGitHubDeploy: harness.githubDeploy }),
}));
vi.mock('~/components/deploy/GitLabDeploy.client', () => ({
  useGitLabDeploy: () => ({ handleGitLabDeploy: harness.gitlabDeploy }),
}));
vi.mock('~/components/deploy/NetlifyDeploy.client', () => ({
  useNetlifyDeploy: () => ({ handleNetlifyDeploy: harness.netlifyDeploy }),
}));
vi.mock('~/components/deploy/VercelDeploy.client', () => ({
  useVercelDeploy: () => ({ handleVercelDeploy: harness.vercelDeploy }),
}));
vi.mock('~/components/deploy/GitHubDeploymentDialog', () => ({ GitHubDeploymentDialog: () => null }));
vi.mock('~/components/deploy/GitLabDeploymentDialog', () => ({ GitLabDeploymentDialog: () => null }));
vi.mock('~/lib/stores/gitlabConnection', () => ({ isGitLabConnected: harness.gitlabStore }));
vi.mock('~/lib/stores/netlify', () => ({ netlifyConnection: harness.netlifyStore }));
vi.mock('~/lib/stores/streaming', () => ({ streamingState: harness.streamingStore }));
vi.mock('~/lib/stores/vercel', () => ({ vercelConnection: harness.vercelStore }));
vi.mock('~/lib/stores/workbench', () => ({ workbenchStore: { previews: harness.previewsStore } }));

import { DeployButton } from './DeployButton';

function createTestI18n(language: 'en' | 'fr') {
  const i18n = createInstance();

  void i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr'],
    resources: { en: { translation: {} }, fr: { translation: {} } },
    initImmediate: false,
  });

  return i18n;
}

describe('DeployButton i18n and async behavior', () => {
  beforeEach(() => {
    harness.netlifyConnection = { user: { id: 'netlify-user' } };
    harness.vercelConnection = { user: { id: 'vercel-user' } };
    harness.gitlabConnected = true;
    harness.streaming = false;
    harness.previews = [{ port: 5173 }];
    harness.toastError.mockReset();
    harness.githubDeploy.mockReset();
    harness.gitlabDeploy.mockReset();
    harness.netlifyDeploy.mockReset();
    harness.vercelDeploy.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders a wrapped 44px French menu and switches its idle label live', async () => {
    const i18n = createTestI18n('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <DeployButton />
      </I18nextProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Déployer' });
    const cloudflare = screen.getByRole('button', { name: 'Déployer vers Cloudflare (bientôt disponible)' });

    expect(trigger.className).toContain('min-h-11');
    expect(trigger.className).toContain('whitespace-normal');
    expect(screen.getByRole('button', { name: 'Déployer vers GitHub' }).className).toContain('min-h-11');
    expect(cloudflare).toHaveProperty('disabled', true);

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('button', { name: 'Deploy' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Deploy to GitHub' })).toBeTruthy();
    expect(screen.queryByText('Déployer vers GitHub')).toBeNull();
  });

  it('announces the active provider, follows a live language switch, and prevents duplicate actions', async () => {
    let resolveDeployment: (() => void) | undefined;

    const pendingDeployment = new Promise<void>((resolve) => {
      resolveDeployment = resolve;
    });

    const onGitHubDeploy = vi.fn(() => pendingDeployment);

    const i18n = createTestI18n('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <DeployButton onGitHubDeploy={onGitHubDeploy} />
      </I18nextProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Déployer vers GitHub' }));

    const busyTrigger = await screen.findByRole('button', { name: 'Déploiement vers GitHub…' });

    expect(busyTrigger.getAttribute('aria-busy')).toBe('true');
    expect(busyTrigger).toHaveProperty('disabled', true);
    expect(onGitHubDeploy).toHaveBeenCalledTimes(1);

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('button', { name: 'Deploying to GitHub…' })).toBeTruthy();

    await act(async () => {
      resolveDeployment?.();
      await pendingDeployment;
    });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Deploy' })).toBeTruthy());
    expect(onGitHubDeploy).toHaveBeenCalledTimes(1);
  });

  it('logs raw callback failures and displays only reviewed localized feedback', async () => {
    const rawFailure = 'provider bearer=secret-value request_id=req-77';

    const onGitLabDeploy = vi.fn(async () => {
      throw new Error(rawFailure);
    });

    const i18n = createTestI18n('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <DeployButton onGitLabDeploy={onGitLabDeploy} />
      </I18nextProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Déployer vers GitLab' }));

    await waitFor(() => {
      expect(harness.toastError).toHaveBeenCalledWith('Impossible de lancer le déploiement. Veuillez réessayer.');
    });
    expect(JSON.stringify(harness.toastError.mock.calls)).not.toContain(rawFailure);
    expect(
      vi
        .mocked(console.error)
        .mock.calls.flat()
        .some((value) => value instanceof Error && value.message === rawFailure),
    ).toBe(true);
  });
});
