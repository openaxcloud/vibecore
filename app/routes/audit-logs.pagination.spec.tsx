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

import AuditLogsPage from './audit-logs';

function renderPage(loaderData: unknown) {
  routeState.loaderData = loaderData;
  routeState.revalidatorState = 'idle';

  return render(<AuditLogsPage />);
}

/*
 * `/audit-logs` figeait l'onglet à l'ouverture.
 *
 * Le store borne déjà la requête à 2000 lignes, mais un plafond de DONNÉES
 * protège le serveur, pas le navigateur : 2000 lignes rendues d'un coup — une
 * carte par ligne en mobile, une rangée de tableau en desktop — bloquent le fil
 * principal plusieurs secondes.
 *
 * Ces tests portent sur ce qui est RENDU, pas sur ce qui est chargé.
 */

afterEach(cleanup);

function makeLogs(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    action: index % 2 === 0 ? 'role.update' : 'project.create',
    resourceType: 'project',
    actorUserId: `user-${index}`,
    ipAddress: '10.0.0.1',
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index % 60)).toISOString(),
  }));
}

function renderLogs(count: number) {
  return renderPage({
    orgId: 'org-1',
    auditLogs: makeLogs(count),
    listError: false,
    forbidden: false,
    exportError: false,
    language: 'en',
  });
}

describe('/audit-logs — le rendu est borné', () => {
  it('ne rend jamais les 2000 lignes d’un coup', () => {
    renderLogs(2000);

    // 50 rangées de données + l'en-tête du tableau.
    expect(screen.getAllByRole('row').length).toBeLessThanOrEqual(51);
  });

  it('annonce la tranche affichée et le total', () => {
    renderLogs(2000);

    expect(screen.getByText(/Events 1.50 of 2,?000/)).toBeTruthy();
  });

  it('avance d’une page et met le décompte à jour', () => {
    renderLogs(2000);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText(/Events 51.100 of 2,?000/)).toBeTruthy();
  });

  it('désactive « Précédent » sur la première page plutôt que de le masquer', () => {
    renderLogs(2000);

    // Masquer le bouton ferait sauter la mise en page entre la page 1 et la 2.
    expect(screen.getByRole('button', { name: 'Previous' }).hasAttribute('disabled')).toBe(true);
  });

  it('n’affiche aucune commande quand tout tient sur une page', () => {
    renderLogs(12);

    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });
});
