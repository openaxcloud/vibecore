/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FormEventHandler, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());
const revalidateMock = vi.hoisted(() => vi.fn());

const routeState = vi.hoisted(() => ({
  actionData: undefined as unknown,
  loaderData: undefined as unknown,
  navigationState: 'idle',
  revalidatorState: 'idle',
}));

vi.mock('~/lib/enterprise-api.server', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    Form: ({
      children,
      className,
      noValidate,
      onSubmit,
    }: {
      children: ReactNode;
      className?: string;
      noValidate?: boolean;
      onSubmit?: FormEventHandler<HTMLFormElement>;
    }) => (
      <form className={className} noValidate={noValidate} onSubmit={onSubmit}>
        {children}
      </form>
    ),
    useActionData: () => routeState.actionData,
    useLoaderData: () => routeState.loaderData,
    useNavigation: () => ({ state: routeState.navigationState }),
    useRevalidator: () => ({ state: routeState.revalidatorState, revalidate: revalidateMock }),
  };
});

vi.mock('~/components/dashboard/AsyncPanelState', () => ({
  AsyncPanelSkeleton: ({ label }: { label: string }) => <section aria-label={label} data-testid="skeleton" />,
  AsyncPanelError: ({ title, description, onRetry }: { title: string; description: string; onRetry: () => void }) => (
    <section role="alert">
      <h2>{title}</h2>
      <p>{description}</p>
      <button type="button" onClick={onRetry}>
        Réessayer
      </button>
    </section>
  ),
}));

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  StatusPill: ({ label }: { label: string }) => <span>{label}</span>,
}));

vi.mock('~/components/ui/Dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import AccountDataPage, { action, loader, meta } from './account-settings.data';
import { getAccountDataPageCopy } from '~/lib/i18n/catalogs/account-data';

type TestDeletionView = {
  status: 'none' | 'requested' | 'grace_period' | 'ready_to_purge' | 'purged';
  canCancel: boolean;
  requestedAt: string | null;
  purgeDueAt: string | null;
  gracePeriodDays: number;
  scope: { deleted: string[]; retained: string[] };
};

const activeView: TestDeletionView = {
  status: 'none',
  canCancel: false,
  requestedAt: null,
  purgeDueAt: null,
  gracePeriodDays: 14,
  scope: {
    deleted: ['Projects and workspaces', 'Chats and AI history', 'New server-only English category'],
    retained: ['Invoices and payment records (legal/financial retention)'],
  },
};

function renderData(
  view: TestDeletionView | null,
  actionData?: unknown,
  options: { loadError?: boolean; revalidatorState?: 'idle' | 'loading' } = {},
) {
  routeState.loaderData = {
    view,
    email: 'Avi+Prod@E-Code.ai',
    loadError: options.loadError ?? false,
    language: 'fr',
    loadedAt: '2026-08-04T12:00:00.000Z',
  };
  routeState.actionData = actionData;
  routeState.navigationState = 'idle';
  routeState.revalidatorState = options.revalidatorState ?? 'idle';

  return render(<AccountDataPage />);
}

async function runAction(fields: Record<string, string>) {
  const form = new URLSearchParams();

  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }

  const result = (await action({
    request: new Request('http://localhost/account-settings/data', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: form.toString(),
    }),
  } as never)) as {
    data: {
      ok: false;
      intent: 'request' | 'cancel' | 'unknown';
      errorCode: keyof ReturnType<typeof getAccountDataPageCopy>['errors'];
    };
    init?: { status?: number } | number | null;
  };

  const init = typeof result.init === 'number' ? { status: result.init } : result.init;

  return { body: result.data, status: init?.status ?? 200 };
}

afterEach(() => {
  cleanup();
  apiRequestMock.mockReset();
  revalidateMock.mockReset();
  vi.restoreAllMocks();
});

describe('account data French surface', () => {
  it('localizes metadata and the complete active-account surface', () => {
    const tags = meta({ data: { language: 'fr' } } as never);

    expect(tags).toContainEqual({ title: 'Données et confidentialité — E-Code' });
    expect(tags).toContainEqual(
      expect.objectContaining({ name: 'description', content: expect.stringContaining('suppression du compte') }),
    );

    renderData(activeView);

    expect(screen.getByRole('heading', { name: 'État du compte' })).toBeTruthy();
    expect(screen.getByText('Actif')).toBeTruthy();
    expect(screen.getByText('Données supprimées')).toBeTruthy();
    expect(screen.getByText('Projets et espaces de travail')).toBeTruthy();
    expect(screen.getByText('Conversations et historique de l’IA')).toBeTruthy();
    expect(screen.getByText('Autres données du compte')).toBeTruthy();
    expect(screen.queryByText('New server-only English category')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Télécharger mes données' })).toBeTruthy();
    expect(screen.getByText('Clés API (noms et préfixes uniquement)')).toBeTruthy();
    expect(screen.getByText('Jetons d’accès OAuth et de connexion')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Télécharger mes données (JSON)' }).className).toContain('w-full');
    expect(screen.queryByText('Download my data')).toBeNull();
  });

  it('keeps the account email unchanged and renders a responsive French confirmation dialog', () => {
    renderData(activeView);

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le compte…' }));

    expect(screen.getByRole('heading', { name: 'Supprimer votre compte ?' })).toBeTruthy();
    expect(screen.getByText('Avi+Prod@E-Code.ai')).toBeTruthy();
    expect(screen.getByText('18 août 2026, 12:00', { exact: false })).toBeTruthy();

    const confirm = screen.getByRole('textbox');
    const submit = screen.getByRole('button', { name: 'Demander la suppression du compte' });

    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(confirm, { target: { value: 'avi+prod@e-code.ai' } });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole('dialog').querySelector('form')?.noValidate).toBe(true);
    expect(submit.parentElement?.className).toContain('flex-col-reverse');
  });

  it('does not expose a false active or repeat-delete state once purge is in progress', () => {
    renderData({
      ...activeView,
      status: 'ready_to_purge',
      requestedAt: '2026-07-20T12:00:00.000Z',
      purgeDueAt: '2026-08-03T12:00:00.000Z',
    });

    expect(screen.getByText('Suppression en cours')).toBeTruthy();
    expect(screen.getByText('La suppression définitive de votre compte est en cours.')).toBeTruthy();
    expect(screen.queryByText('Votre compte est actif. Vous pouvez demander sa suppression ci-dessous.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Supprimer le compte…' })).toBeNull();
  });

  it('localizes recoverable error and loading states', () => {
    const { unmount } = renderData(null, undefined, { loadError: true });

    expect(
      screen.getByRole('heading', {
        name: 'Impossible de charger les paramètres de données et de confidentialité',
      }),
    ).toBeTruthy();
    expect(screen.getByText('Aucune donnée du compte n’a été modifiée.', { exact: false })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(revalidateMock).toHaveBeenCalledTimes(1);
    unmount();

    renderData(null, undefined, { loadError: true, revalidatorState: 'loading' });
    expect(screen.getByLabelText('Chargement des paramètres de données et de confidentialité')).toBeTruthy();
  });

  it('renders safe French action errors inside the deletion dialog', () => {
    renderData(activeView, { ok: false, intent: 'request', errorCode: 'requestRejected' });

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le compte…' }));

    expect(screen.getByRole('alert').textContent).toBe(
      'La requête a été refusée. Vérifiez vos autorisations, puis réessayez.',
    );
    expect(screen.queryByText('Forbidden')).toBeNull();
  });

  it('maps raw API bodies to safe error codes and preserves their status', async () => {
    const rawTechnicalMessage = 'Forbidden: upstream VC_INTERNAL_ACCOUNT_DELETE';

    apiRequestMock.mockResolvedValueOnce({ user: { email: 'Avi+Prod@E-Code.ai' } }).mockRejectedValueOnce(
      new Response(JSON.stringify({ error: rawTechnicalMessage }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await runAction({
      intent: 'request',
      confirm: 'Avi+Prod@E-Code.ai',
    });

    expect(result).toEqual({
      status: 403,
      body: { ok: false, intent: 'request', errorCode: 'requestRejected' },
    });
    expect(JSON.stringify(result.body)).not.toContain(rawTechnicalMessage);
  });

  it('validates the confirmation server-side with localized error data', async () => {
    apiRequestMock.mockResolvedValueOnce({ user: { email: 'Avi+Prod@E-Code.ai' } });

    const result = await runAction({ intent: 'request', confirm: 'wrong@example.com' });

    expect(result).toEqual({
      status: 400,
      body: { ok: false, intent: 'request', errorCode: 'confirmationMismatch' },
    });
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
  });

  it('localizes the export filename while preserving exported user data', async () => {
    apiRequestMock.mockResolvedValueOnce({ profile: { displayName: 'English User Content' } });

    const response = (await loader({
      request: new Request('http://localhost/account-data?export=data', {
        headers: { 'accept-language': 'fr-FR,fr;q=0.9' },
      }),
    } as never)) as Response;

    expect(response.headers.get('content-language')).toBe('fr');
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="ecode-export-donnees-\d{4}-\d{2}-\d{2}\.json"$/u,
    );
    expect(await response.json()).toEqual({ profile: { displayName: 'English User Content' } });
  });

  it('returns a localized-safe load state without serializing technical failures', async () => {
    const rawTechnicalMessage = 'ECONNRESET from account-deletion-primary';

    apiRequestMock.mockRejectedValue(new Error(rawTechnicalMessage));

    const result = (await loader({
      request: new Request('http://localhost/account-settings/data', {
        headers: { 'accept-language': 'fr-FR,fr;q=0.9' },
      }),
    } as never)) as {
      data: { view: null; email: string; loadError: boolean; language: string; loadedAt: string };
    };

    expect(result.data).toMatchObject({ view: null, email: '', loadError: true, language: 'fr' });
    expect(Number.isNaN(new Date(result.data.loadedAt).getTime())).toBe(false);
    expect(JSON.stringify(result.data)).not.toContain(rawTechnicalMessage);
  });
});
