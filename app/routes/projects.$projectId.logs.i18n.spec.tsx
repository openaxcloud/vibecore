/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const routeState = vi.hoisted(() => ({
  data: {
    project: { id: 'project-1' },
    data: {
      workspace: { id: 'workspace-1', status: 'RUNNING', runtimeMode: 'remote' },
      runtimeLogs: { logs: [] as Array<{ level: 'info'; message: string }>, unavailable: false },
    },
  },
  revalidatorState: 'idle',
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    useLoaderData: () => routeState.data,
    useRevalidator: () => ({ state: routeState.revalidatorState, revalidate: vi.fn() }),
  };
});

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  ProjectShell: ({ title, description, children }: { title: string; description: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </main>
  ),
}));

import ProjectLogsPage, { meta } from './projects.$projectId.logs';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(() => {
  cleanup();
  routeState.data.data.workspace.status = 'RUNNING';
  routeState.data.data.runtimeLogs = { logs: [], unavailable: false };
  routeState.revalidatorState = 'idle';
});

describe('project logs i18n', () => {
  it('switches shell, workspace status, controls and empty state live', async () => {
    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <ProjectLogsPage />
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Journaux' })).toBeTruthy();
    expect(screen.getByText(/Espace de travail : En cours d’exécution/u)).toBeTruthy();
    expect(screen.getByText(/Mises à jour en direct/u)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Actualiser' })).toBeTruthy();
    expect(screen.getByText(/Aucune sortie de l’environnement d’exécution/u)).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('heading', { name: 'Logs' })).toBeTruthy();
    expect(screen.getByText(/Workspace: Running/u)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
    expect(screen.getByText('No runtime output has been captured yet.')).toBeTruthy();
  });

  it('shows a safe French recovery state while preserving real runtime output verbatim', () => {
    routeState.data.data.runtimeLogs = {
      logs: [{ level: 'info', message: 'User-owned console output' }],
      unavailable: false,
    };

    const i18n = createI18nInstance('fr');

    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <ProjectLogsPage />
      </I18nextProvider>,
    );

    expect(screen.getByText('User-owned console output')).toBeTruthy();

    routeState.data.data.runtimeLogs = { logs: [], unavailable: true };
    rerender(
      <I18nextProvider i18n={i18n}>
        <ProjectLogsPage />
      </I18nextProvider>,
    );

    expect(screen.getByRole('alert').textContent).toContain('temporairement indisponibles');
    expect(screen.getByRole('alert').textContent).not.toContain('upstream');
  });

  it('emits localized SEO with canonical and hreflang links', () => {
    const tags = meta({ data: { language: 'fr' }, matches: [], params: { projectId: 'project-1' } } as never);

    expect(tags).toContainEqual({ title: 'Journaux du projet - E-Code' });
    expect(tags).toContainEqual({ property: 'og:locale', content: 'fr_FR' });
    expect(tags).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://e-code.ai/projects/project-1/logs',
    });
    expect(tags).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: 'https://e-code.ai/projects/project-1/logs?lang=fr',
    });
  });
});
