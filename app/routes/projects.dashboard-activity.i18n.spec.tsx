/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const routeState = vi.hoisted(() => ({
  data: {} as {
    project: { id: string; name: string; description?: string; gitDefaultBranch?: string };
    data: Record<string, unknown>;
  },
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return { ...actual, useLoaderData: () => routeState.data };
});

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  ProjectShell: ({ title, description, children }: { title: string; description: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </main>
  ),
  StatGrid: ({ stats }: { stats: Array<{ label: string; value: string; detail: string }> }) => (
    <section aria-label="stats">
      {stats.map((stat) => (
        <article key={stat.label}>
          <h2>{stat.label}</h2>
          <p>{stat.value}</p>
          <p>{stat.detail}</p>
        </article>
      ))}
    </section>
  ),
  ActivityList: ({ items }: { items: Array<{ title: string; detail: ReactNode }> }) => (
    <section aria-label="activity">
      {items.map((item, index) => (
        <article key={`${item.title}-${index}`}>
          <h2>{item.title}</h2>
          <p>{item.detail}</p>
        </article>
      ))}
    </section>
  ),
}));

import ProjectDashboardPage, { meta as dashboardMeta } from './projects.$projectId._index';
import ProjectActivityPage, { meta as activityMeta } from './projects.$projectId.activity';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(() => cleanup());

describe('project dashboard and activity routes i18n', () => {
  it('renders the French dashboard, formats counts and preserves project-authored and technical values', async () => {
    routeState.data = {
      project: {
        id: 'project-1',
        name: 'Atelier Northwind',
        description: 'Description rédigée par le client',
        gitDefaultBranch: 'release/customer-v2',
      },
      data: {
        workspace: { id: 'workspace-1', status: 'RUNNING', runtimeMode: 'node-22-customer' },
        files: Array.from({ length: 1234 }, (_, index) => ({ path: `src/${index}.ts` })),
        git: { ahead: 12, behind: 3 },
        recentActivity: [{ id: 'event-1', action: 'project.import_github' }],
      },
    };

    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <ProjectDashboardPage />
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Atelier Northwind', level: 1 })).toBeTruthy();
    expect(screen.getByText('Description rédigée par le client')).toBeTruthy();
    expect(screen.getByText('En cours d’exécution')).toBeTruthy();
    expect(screen.getByText('Environnement d’exécution : node-22-customer')).toBeTruthy();
    expect(screen.getByText('release/customer-v2')).toBeTruthy();
    expect(document.body.textContent).toContain('1 234');
    expect(screen.getByRole('heading', { name: 'Dépôt GitHub importé' })).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByText('Running')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'GitHub repository imported' })).toBeTruthy();
    expect(screen.getByText('Description rédigée par le client')).toBeTruthy();
  });

  it('renders safe French activity labels and never displays raw audit implementation codes', () => {
    routeState.data = {
      project: { id: 'project-1', name: 'Projet client' },
      data: {
        activity: [
          { id: 'event-1', action: 'project.secret.upsert', createdAt: '2026-08-04T12:00:00.000Z' },
          { id: 'event-2', action: 'internal.raw.action' },
        ],
      },
    };

    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <ProjectActivityPage />
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Activité du projet', level: 1 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Secret mis à jour' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Activité du projet', level: 2 })).toBeTruthy();
    expect(screen.queryByText('project.secret.upsert')).toBeNull();
    expect(screen.queryByText('internal.raw.action')).toBeNull();
    expect(screen.getByText('4 août 2026, 12:00')).toBeTruthy();
  });

  it('emits localized canonical, hreflang, Open Graph and Twitter metadata', () => {
    const dashboardTags = dashboardMeta({
      data: { language: 'fr', project: { name: 'Projet client' } },
      matches: [],
      params: { projectId: 'project/1' },
    } as never);
    const activityTags = activityMeta({
      data: { language: 'fr' },
      matches: [],
      params: { projectId: 'project/1' },
    } as never);

    expect(dashboardTags).toContainEqual({ property: 'og:locale', content: 'fr_FR' });
    expect(dashboardTags).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://e-code.ai/projects/project%2F1',
    });
    expect(activityTags).toContainEqual({ title: 'Activité du projet - E-Code' });
    expect(activityTags).toContainEqual({ name: 'twitter:title', content: 'Activité du projet - E-Code' });
    expect(activityTags).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: 'https://e-code.ai/projects/project%2F1/activity?lang=fr',
    });
  });
});
