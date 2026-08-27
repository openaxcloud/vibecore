/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FormEventHandler, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());
const revalidateMock = vi.hoisted(() => vi.fn());
const previewSubmitMock = vi.hoisted(() => vi.fn());
const restoreSubmitMock = vi.hoisted(() => vi.fn());

const routeState = vi.hoisted(() => ({
  loaderData: undefined as unknown,
  actionData: undefined as unknown,
  navigationState: 'idle',
  navigationFormData: undefined as FormData | undefined,
  revalidatorState: 'idle',
  fetcherCall: 0,
  previewFetcher: { state: 'idle', data: undefined as unknown, submit: previewSubmitMock },
  restoreFetcher: { state: 'idle', data: undefined as unknown, submit: restoreSubmitMock },
}));

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/enterprise-api.server')>();

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  };
});

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
    useNavigation: () => ({ state: routeState.navigationState, formData: routeState.navigationFormData }),
    useRevalidator: () => ({ state: routeState.revalidatorState, revalidate: revalidateMock }),
    useFetcher: () => {
      const fetcher = routeState.fetcherCall % 2 === 0 ? routeState.previewFetcher : routeState.restoreFetcher;
      routeState.fetcherCall += 1;

      return fetcher;
    },
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

vi.mock('~/components/ui/RelativeTime', () => ({
  RelativeTime: () => <time>il y a 2 heures</time>,
}));

vi.mock('~/components/ui/Dialog', () => ({
  ConfirmationDialog: ({
    isOpen,
    title,
    description,
    confirmLabel,
    onConfirm,
  }: {
    isOpen: boolean;
    title: string;
    description: ReactNode;
    confirmLabel: string;
    onConfirm: () => void;
  }) =>
    isOpen ? (
      <section role="dialog">
        <h2>{title}</h2>
        <div>{description}</div>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </section>
    ) : null,
}));

vi.mock('react-toastify', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import ProjectSnapshotsPage, { action, loader, meta } from './projects.$projectId.snapshots';
import {
  formatProjectSnapshotBytes,
  formatProjectSnapshotsPlural,
  getProjectSnapshotsCopy,
  projectSnapshotDisplayLabel,
  projectSnapshotKindLabel,
  projectSnapshotsErrorMessage,
} from '~/lib/i18n/catalogs/project-snapshots';

function resetRouteState() {
  routeState.loaderData = undefined;
  routeState.actionData = undefined;
  routeState.navigationState = 'idle';
  routeState.navigationFormData = undefined;
  routeState.revalidatorState = 'idle';
  routeState.fetcherCall = 0;
  routeState.previewFetcher.state = 'idle';
  routeState.previewFetcher.data = undefined;
  routeState.restoreFetcher.state = 'idle';
  routeState.restoreFetcher.data = undefined;
}

function renderPage(loaderData: unknown, actionData?: unknown) {
  resetRouteState();
  routeState.loaderData = loaderData;
  routeState.actionData = actionData;

  return render(<ProjectSnapshotsPage />);
}

async function runAction(fields: Record<string, string>, projectId = 'project-1') {
  return (await action({
    request: new Request(`https://e-code.ai/projects/${projectId}/snapshots?lang=fr`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    }),
    params: { projectId },
    context: {},
  })) as {
    data?: { errorCode?: string; restoredLabel?: string; safetySnapshotCreated?: boolean };
    init?: { status?: number };
  };
}

afterEach(() => {
  cleanup();
  apiRequestMock.mockReset();
  revalidateMock.mockReset();
  previewSubmitMock.mockReset();
  restoreSubmitMock.mockReset();
  resetRouteState();
});

describe('project snapshots i18n', () => {
  it('renders the complete French surface, localized units and preserved user identifiers', () => {
    renderPage({
      project: { id: 'project-1', name: 'Projet client' },
      data: {
        snapshots: [
          {
            id: 'snapshot/customer-1',
            label: 'Nightly customer snapshot',
            kind: 'before-ai-change',
            byteLength: 1536,
            createdAt: '2026-08-05T01:00:00.000Z',
          },
          {
            id: 'snapshot/safety-1',
            label: 'Before restore of État client',
            kind: 'automatic',
            byteLength: 2048,
            createdAt: '2026-08-05T02:00:00.000Z',
          },
        ],
      },
      snapshotsUnavailable: false,
      language: 'fr',
    });

    expect(screen.getByRole('heading', { name: 'Instantanés' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Instantanés du projet' })).toBeTruthy();
    expect(screen.getByText('Nightly customer snapshot')).toBeTruthy();
    expect(screen.getAllByText(/Avant la restauration de/u).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Before restore of/u)).toBeNull();
    expect(screen.getByText(/Avant une modification de l’IA · 1,5\s*Ko/u)).toBeTruthy();
    expect(screen.getByText(/snapshot\/customer-1/u)).toBeTruthy();
    expect(screen.getByLabelText('Nom de l’instantané')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Créer l’instantané' })).toBeTruthy();

    const restoreButton = screen.getByRole('button', { name: 'Restaurer Nightly customer snapshot' });
    expect(restoreButton.className).toContain('whitespace-normal');
    fireEvent.click(restoreButton);

    expect(previewSubmitMock).toHaveBeenCalledWith(
      { intent: 'preview', snapshotId: 'snapshot/customer-1' },
      { method: 'post' },
    );
    expect(screen.getByRole('heading', { name: 'Restaurer « Nightly customer snapshot » ?' })).toBeTruthy();
    expect(screen.queryByText('Create snapshot')).toBeNull();
    expect(screen.queryByText('Restore snapshot')).toBeNull();
  });

  it('renders a recoverable localized panel and a safe action error', () => {
    renderPage(
      {
        project: { id: 'project-1', name: 'Projet client' },
        data: { snapshots: [] },
        snapshotsUnavailable: true,
        language: 'fr',
      },
      { errorCode: 'unavailable' },
    );

    expect(screen.getByRole('heading', { name: 'Impossible de charger les instantanés du projet' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recharger les instantanés' })).toBeTruthy();
    expect(
      screen.getByText('Les instantanés sont temporairement indisponibles. Réessayez dans quelques instants.'),
    ).toBeTruthy();
  });

  it('detects French in SSR and degrades only the snapshots panel when its API fails', async () => {
    apiRequestMock.mockResolvedValueOnce({ project: { id: 'project-1', name: 'Projet client' } });
    apiRequestMock.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'Raw backend English storage outage' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = (await loader({
      request: new Request('https://e-code.ai/projects/project-1/snapshots', {
        headers: { 'accept-language': 'fr-FR,fr;q=0.9' },
      }),
      params: { projectId: 'project-1' },
      context: {},
    })) as { data: { language: string; snapshotsUnavailable: boolean; data: { snapshots: unknown[] } } };

    expect(response.data.language).toBe('fr');
    expect(response.data.snapshotsUnavailable).toBe(true);
    expect(response.data.data.snapshots).toEqual([]);
    expect(JSON.stringify(response.data)).not.toContain('Raw backend English storage outage');
  });

  it('uses a localized default label and encodes project identifiers on create', async () => {
    apiRequestMock.mockResolvedValueOnce({ snapshot: { id: 'snapshot-1' } });

    const response = await runAction({ intent: 'create', label: '' }, 'project/customer');

    expect(apiRequestMock).toHaveBeenCalledWith(
      expect.any(Request),
      '/projects/project%2Fcustomer/snapshots',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ label: 'Point de contrôle manuel', kind: 'manual', manifest: {} }),
      }),
    );
    expect(response).toBeInstanceOf(Response);
    expect((response as unknown as Response).headers.get('location')).toBe(
      '/projects/project%2Fcustomer/snapshots?lang=fr',
    );
  });

  it('maps raw preview and restore failures to stable localized codes', async () => {
    apiRequestMock.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'Raw backend English preview failure' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const preview = await runAction({ intent: 'preview', snapshotId: 'snapshot/1' });

    apiRequestMock.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'CHECKSUM_MISMATCH: archive corrupt' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const restore = await runAction({ intent: 'restore', snapshotId: 'snapshot/1', snapshotLabel: 'État stable' });

    expect(apiRequestMock.mock.calls[0]?.[1]).toBe('/projects/project-1/snapshots/snapshot%2F1/restore-preview');
    expect(apiRequestMock.mock.calls[1]?.[1]).toBe('/projects/project-1/snapshots/snapshot%2F1/restore');
    expect(preview.data?.errorCode).toBe('notFound');
    expect(restore.data?.errorCode).toBe('conflict');
    expect(JSON.stringify([preview.data, restore.data])).not.toMatch(/Raw backend|CHECKSUM_MISMATCH/u);
    expect(projectSnapshotsErrorMessage('conflict', 'fr')).toContain('restauré en toute sécurité');
  });

  it('rejects a malformed restore preview as a recoverable safe error', async () => {
    apiRequestMock.mockResolvedValueOnce({
      preview: {
        snapshotId: 'snapshot-1',
        counts: { added: 'many', changed: 0, removed: 0, unchanged: 0 },
        files: { added: [], changed: [], removed: [] },
        truncated: false,
      },
    });

    const response = await runAction({ intent: 'preview', snapshotId: 'snapshot-1' });

    expect(response.data).toEqual({ errorCode: 'unavailable', snapshotId: 'snapshot-1' });
    expect(response.init?.status).toBe(502);
  });

  it('never returns the backend-owned English safety label after a successful restore', async () => {
    apiRequestMock.mockResolvedValueOnce({
      snapshot: { id: 'snapshot-1', label: 'État stable' },
      safetySnapshot: { id: 'safety-1', label: 'Before restore of État stable' },
    });

    const response = await runAction({ intent: 'restore', snapshotId: 'snapshot-1', snapshotLabel: 'État stable' });

    expect(response.data).toEqual({
      ok: true,
      snapshotId: 'snapshot-1',
      restoredLabel: 'État stable',
      safetySnapshotCreated: true,
    });
    expect(JSON.stringify(response.data)).not.toContain('Before restore of');
  });

  it('falls back to English while keeping plurals, kinds, bytes and metadata locale-aware', () => {
    expect(getProjectSnapshotsCopy('de')['projectSnapshots.create.submit']).toBe('Create snapshot');
    expect(formatProjectSnapshotsPlural('projectSnapshots.list.count', 1, 'fr')).toBe('1 instantané');
    expect(formatProjectSnapshotsPlural('projectSnapshots.list.count', 2, 'fr')).toBe('2 instantanés');
    expect(formatProjectSnapshotBytes(1536, 'fr')).toBe('1,5 Ko');
    expect(formatProjectSnapshotBytes(1536, 'en')).toBe('1.5 KB');
    expect(projectSnapshotKindLabel('before_ai_change', 'fr')).toBe('Avant une modification de l’IA');
    expect(projectSnapshotDisplayLabel('Before restore of État client', 'automatic', 'fr')).toBe(
      'Avant la restauration de « État client »',
    );
    expect(meta({ matches: [{ id: 'root', data: { language: 'fr' } }] } as never)?.[0]).toEqual({
      title: 'Instantanés du projet — E-Code',
    });
  });
});
