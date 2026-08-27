/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import type { FormEventHandler, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const routeState = vi.hoisted(() => ({
  actionData: undefined as unknown,
  loaderData: undefined as unknown,
  navigationState: 'idle',
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    Form: ({
      children,
      className,
      onSubmit,
    }: {
      children: ReactNode;
      className?: string;
      onSubmit?: FormEventHandler<HTMLFormElement>;
    }) => (
      <form className={className} onSubmit={onSubmit}>
        {children}
      </form>
    ),
    useActionData: () => routeState.actionData,
    useLoaderData: () => routeState.loaderData,
    useNavigation: () => ({ state: routeState.navigationState }),
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

vi.mock('~/components/ui/Dialog', () => ({
  ConfirmationDialog: ({
    isOpen,
    title,
    description,
    confirmLabel,
  }: {
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel: string;
  }) =>
    isOpen ? (
      <section role="dialog">
        <h2>{title}</h2>
        <p>{description}</p>
        <button type="button">{confirmLabel}</button>
      </section>
    ) : null,
}));

import ProjectDatabaseRestorePage, { action, meta } from './projects.$projectId.database';
import {
  databaseRestoreStatusLabel,
  formatDatabaseRestoreBytes,
  formatDatabaseRestoreCopy,
  getDatabaseRestoreCopy,
  selectDatabaseRestorePlural,
} from '~/lib/i18n/catalogs/database-restore';
import { createI18nInstance } from '~/lib/i18n/runtime';

function renderPage(loaderData: unknown, actionData?: unknown) {
  routeState.loaderData = loaderData;
  routeState.actionData = actionData;
  routeState.navigationState = 'idle';

  return render(
    <I18nextProvider i18n={createI18nInstance('fr')}>
      <ProjectDatabaseRestorePage />
    </I18nextProvider>,
  );
}

function actionRequest(fields: Record<string, string>) {
  const body = new URLSearchParams(fields).toString();

  return action({
    request: new Request('https://e-code.ai/projects/project-1/database?lang=fr', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    }),
    params: { projectId: 'project-1' },
    context: {},
  });
}

afterEach(() => {
  cleanup();
  routeState.actionData = undefined;
  routeState.loaderData = undefined;
});

describe('project database restore i18n', () => {
  it('keeps fallback, plurals, units, interpolation, and statuses locale-aware', () => {
    const copy = getDatabaseRestoreCopy('fr-FR');
    const oneDay = selectDatabaseRestorePlural(copy, 'databaseRestore.instance.days', 1, 'fr');
    const manyDays = selectDatabaseRestorePlural(copy, 'databaseRestore.instance.days', 7, 'fr');

    expect(formatDatabaseRestoreCopy(oneDay, { count: 1 })).toBe('1 jour');
    expect(formatDatabaseRestoreCopy(manyDays, { count: 7 })).toBe('7 jours');
    expect(formatDatabaseRestoreBytes(1536, 'fr')).toBe('1,5 Ko');
    expect(formatDatabaseRestoreBytes(1536, 'en')).toBe('1.5 KB');
    expect(databaseRestoreStatusLabel('COMPLETED', copy)).toBe('Terminée');
    expect(getDatabaseRestoreCopy('de')['databaseRestore.title']).toBe('Point-in-time restore');
  });

  it('renders the complete enabled surface in French and preserves database-owned values', () => {
    renderPage({
      project: { id: 'project-1', name: 'Projet client' },
      enabled: true,
      entitlement: { allowed: true, retentionDays: 7 },
      instance: {
        id: 'database-1',
        status: 'RUNNING',
        engine: 'PostgreSQL',
        sizeBytes: 1536,
        retentionDays: 7,
        pitrEnabled: true,
      },
      recoveryPoints: [
        {
          id: 'point-1',
          kind: 'manual',
          label: 'Nightly customer snapshot',
          lsn: '0/16B6A40',
          timestamp: '2026-08-04T12:00:00.000Z',
        },
      ],
      window: {
        earliestMs: 1,
        earliest: '2026-07-28T12:00:00.000Z',
        latestMs: 2,
        latest: '2026-08-04T12:00:00.000Z',
        retentionDays: 7,
      },
      restores: [
        {
          id: 'restore-1',
          status: 'FAILED',
          targetTimestamp: '2026-08-03T12:00:00.000Z',
          createdAt: '2026-08-04T12:00:00.000Z',
          error: 'Upstream connection refused',
        },
      ],
    });

    expect(screen.getByRole('heading', { name: 'Restauration à un instant précis' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Base de données gérée' })).toBeTruthy();
    expect(screen.getByText('En cours')).toBeTruthy();
    expect(screen.getByText('PostgreSQL')).toBeTruthy();
    expect(screen.getByText(/1,5\s*Ko/u)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Points de restauration' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Créer un instantané' })).toBeTruthy();
    expect(screen.getByText('Manuel')).toBeTruthy();
    expect(screen.getByText(/Nightly customer snapshot/u)).toBeTruthy();
    expect(screen.getByText(/WAL LSN 0\/16B6A40/u)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restaurer à ce point' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Restaurer à un instant précis' })).toBeTruthy();
    expect(screen.getByText('La restauration n’a pas abouti. Réessayez ou contactez l’assistance.')).toBeTruthy();
    expect(screen.queryByText('Upstream connection refused')).toBeNull();
    expect(screen.queryByText('Recovery points')).toBeNull();
    expect(screen.queryByText('Restore history')).toBeNull();
  });

  it('renders French unavailable and success states', () => {
    renderPage(
      {
        project: { id: 'project-1', name: 'Projet client' },
        enabled: true,
        entitlement: { allowed: false, retentionDays: 1 },
        instance: null,
        recoveryPoints: [],
        window: null,
        restores: [],
      },
      { ok: true, intent: 'snapshot' },
    );

    expect(screen.getByText(/fenêtre de restauration de 1 jour/u)).toBeTruthy();
    expect(screen.getByText(/Instantané demandé/u)).toBeTruthy();
    expect(screen.queryByText(/1 days/u)).toBeNull();
  });

  it('localizes route metadata from the active root language', () => {
    expect(meta({ matches: [{ id: 'root', data: { language: 'fr' } }] } as never)).toEqual([
      { title: 'Restauration de base de données - E-Code' },
    ]);
  });

  it('rejects invalid actions and malformed restore times in French before any API call', async () => {
    const invalidAction = (await actionRequest({ intent: 'drop-database' })) as {
      data: { ok: boolean; error: string };
      init?: { status?: number };
    };
    const invalidTarget = (await actionRequest({ intent: 'restore', targetTimestamp: 'not-a-date' })) as {
      data: { ok: boolean; error: string };
      init?: { status?: number };
    };

    expect(invalidAction.data).toEqual({
      ok: false,
      error: 'Choisissez une action valide pour la base de données.',
    });
    expect(invalidAction.init?.status).toBe(400);
    expect(invalidTarget.data).toEqual({ ok: false, error: 'Choisissez un instant cible valide.' });
    expect(invalidTarget.init?.status).toBe(400);
  });
});
