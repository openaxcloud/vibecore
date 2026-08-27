/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());
const firstOrganizationOrNullMock = vi.hoisted(() => vi.fn());
const revalidateMock = vi.hoisted(() => vi.fn());

const routeState = vi.hoisted(() => ({
  loaderData: undefined as unknown,
  revalidatorState: 'idle',
}));

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/enterprise-api.server')>();

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequestMock(...args),
    firstOrganizationOrNull: (...args: unknown[]) => firstOrganizationOrNullMock(...args),
  };
});

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    useLoaderData: () => routeState.loaderData,
    useRevalidator: () => ({ state: routeState.revalidatorState, revalidate: revalidateMock }),
  };
});

vi.mock('~/components/enterprise/EnterpriseFormPage', () => ({
  EnterpriseFormPage: ({
    title,
    description,
    error,
    children,
  }: {
    title: string;
    description: string;
    error?: string;
    children: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {error ? <p role="alert">{error}</p> : null}
      {children}
    </main>
  ),
}));

vi.mock('~/components/dashboard/AsyncPanelState', () => ({
  AsyncPanelSkeleton: ({ label }: { label: string }) => <section aria-label={label} />,
  AsyncPanelError: ({
    title,
    description,
    retryLabel,
    onRetry,
  }: {
    title: string;
    description: string;
    retryLabel: string;
    onRetry: () => void;
  }) => (
    <section role="alert">
      <h2>{title}</h2>
      <p>{description}</p>
      <button type="button" onClick={onRetry}>
        {retryLabel}
      </button>
    </section>
  ),
}));

import AuditLogsPage, { loader, meta } from './audit-logs';
import {
  auditActionLabel,
  auditResourceLabel,
  formatAuditEventCount,
  formatAuditTimestamp,
  getAuditLogsCopy,
} from '~/lib/i18n/catalogs/audit-logs';

function renderPage(loaderData: unknown) {
  routeState.loaderData = loaderData;
  routeState.revalidatorState = 'idle';

  return render(<AuditLogsPage />);
}

function loaderRequest(search = '', headers?: HeadersInit): Request {
  return new Request(`https://e-code.ai/audit-logs${search}`, { headers });
}

afterEach(() => {
  cleanup();
  apiRequestMock.mockReset();
  firstOrganizationOrNullMock.mockReset();
  revalidateMock.mockReset();
  routeState.loaderData = undefined;
});

describe('audit logs i18n', () => {
  it('renders French labels, localized dates and responsive event cards', () => {
    renderPage({
      orgId: 'org-1',
      auditLogs: [
        {
          createdAt: '2026-08-04T09:30:00.000Z',
          action: 'project.create',
          resourceType: 'project',
          actorUserId: 'user-1',
          ipAddress: '203.0.113.20',
        },
        {
          createdAt: '2026-08-04T10:00:00.000Z',
          action: 'deployment.create',
          resourceType: 'deployment',
        },
      ],
      listError: false,
      listErrorKind: null,
      forbidden: false,
      exportError: false,
      language: 'fr',
    });

    expect(screen.getByRole('heading', { name: 'Journaux d’audit' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Exporter' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Exporter en CSV' }).getAttribute('href')).toBe(
      '/audit-logs?export=csv&lang=fr',
    );
    expect(screen.getAllByText('Projet créé').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Projet').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Membre de l’organisation').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/4 août 2026/u).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByText('Recent events')).toBeNull();
  });

  it('filters with React state and announces the localized result count', () => {
    renderPage({
      orgId: 'org-1',
      auditLogs: [
        { createdAt: '2026-08-04T09:30:00.000Z', action: 'project.create', resourceType: 'project' },
        { createdAt: '2026-08-04T10:00:00.000Z', action: 'deployment.create', resourceType: 'deployment' },
      ],
      listError: false,
      listErrorKind: null,
      forbidden: false,
      exportError: false,
      language: 'fr',
    });

    fireEvent.change(screen.getByTestId('audit-action-filter'), { target: { value: 'project.create' } });

    expect(screen.getByText('1 événement affiché')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getAllByText('Projet créé').length).toBeGreaterThan(0);
  });

  it('renders localized recoverable permission and export errors', () => {
    const { rerender } = renderPage({
      orgId: 'org-1',
      auditLogs: [],
      listError: true,
      listErrorKind: 'permission',
      forbidden: false,
      exportError: false,
      language: 'fr',
    });

    expect(screen.getByRole('heading', { name: 'L’accès aux journaux d’audit est restreint' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recharger les journaux d’audit' })).toBeTruthy();

    routeState.loaderData = {
      orgId: 'org-1',
      auditLogs: [],
      listError: false,
      listErrorKind: null,
      forbidden: false,
      exportError: true,
      language: 'fr',
    };
    rerender(<AuditLogsPage />);

    expect(screen.getByRole('alert').textContent).toContain('Impossible de préparer l’export d’audit');
  });

  it('detects French and masks raw list and export failures', async () => {
    firstOrganizationOrNullMock.mockResolvedValue({ id: 'org-1', name: 'Northwind' });
    apiRequestMock.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'Raw backend English list failure' }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const listResult = (await loader({
      request: loaderRequest('', { 'accept-language': 'fr-FR,fr;q=0.9' }),
      params: {},
      context: {},
    })) as { data: { language: string; listError: boolean } };

    expect(listResult.data.language).toBe('fr');
    expect(listResult.data.listError).toBe(true);
    expect(JSON.stringify(listResult.data)).not.toContain('Raw backend English list failure');

    apiRequestMock.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'Raw backend English export failure' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const exportResult = (await loader({
      request: loaderRequest('?lang=fr&export=csv'),
      params: {},
      context: {},
    })) as Response;

    expect(exportResult.status).toBe(302);
    expect(exportResult.headers.get('location')).toBe('/audit-logs?exportError=1&lang=fr');
    expect(exportResult.headers.get('location')).not.toContain('Raw backend English export failure');
  });

  it('localizes export filenames without changing exported content', async () => {
    firstOrganizationOrNullMock.mockResolvedValue({ id: 'org-1', name: 'Northwind' });
    apiRequestMock.mockResolvedValue('time,action\n2026-08-04,project.create\n');

    const response = (await loader({
      request: loaderRequest('?lang=fr&export=csv'),
      params: {},
      context: {},
    })) as Response;

    expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="journaux-audit-/u);
    expect(await response.text()).toContain('project.create');
  });

  it('falls back safely and preserves unknown technical identifiers', () => {
    expect(getAuditLogsCopy('de')['auditLogs.export.title']).toBe('Export');
    expect(auditActionLabel('custom_worker.reconcile', 'fr')).toBe('custom_worker.reconcile');
    expect(auditResourceLabel('custom_worker', 'fr')).toBe('custom_worker');
    expect(auditActionLabel('support.ticket.create', 'fr')).toBe('Demande d’assistance ouverte');
    expect(formatAuditEventCount(2, 'fr')).toBe('2 événements affichés');
    expect(formatAuditTimestamp('not-a-date', 'fr')).toBe('Date indisponible');
    expect(
      meta({
        data: undefined,
        location: {} as never,
        params: {},
        matches: [{ id: 'root', data: { language: 'fr' } }] as never,
      })?.[0],
    ).toEqual({ title: 'Journaux d’audit - E-Code' });
  });
});
