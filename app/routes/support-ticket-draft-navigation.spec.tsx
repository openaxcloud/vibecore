/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Request as FetchRequest } from 'node-fetch';
import { createMemoryRouter, data, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SupportTicketPage from './support_.$id';

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ i18n: { language: 'en', resolvedLanguage: 'en' }, t: (key: string) => key }),
}));

const routers: ReturnType<typeof createMemoryRouter>[] = [];
afterEach(() => {
  cleanup();
  routers.splice(0).forEach((router) => router.dispose());
  vi.unstubAllGlobals();
});

function deferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((r) => {
    resolve = r;
  });

  return { promise, resolve };
}

const fixture = (id = 'ticket-1') => ({
  language: 'en',
  loadState: 'ready',
  loadErrorCode: null,
  ticket: { id, subject: 'Synthetic ticket', status: 'OPEN' },
  messages: [],
});

async function setup(
  action: () => unknown | Promise<unknown> = () => data({ sent: true }),
  nextLoad?: () => Promise<ReturnType<typeof fixture>>,
  forceRevalidation = true,
) {
  vi.stubGlobal('Request', FetchRequest);

  let loads = 0;

  const router = createMemoryRouter(
    [
      {
        path: '/support/:id',

        // Force the delayed-reload stress cases; default-policy cases explicitly disable this override.
        shouldRevalidate: forceRevalidation ? () => true : undefined,
        HydrateFallback: () => null,
        element: <SupportTicketPage />,
        loader: ({ params }) => (++loads > 1 && nextLoad ? nextLoad() : fixture(params.id)),
        action,
      },
      { path: '/support', element: <p>Ticket list</p> },
    ],
    { initialEntries: ['/support/ticket-1'] },
  );
  routers.push(router);
  render(<RouterProvider router={router} />);

  const field = await screen.findByRole('textbox');

  return { router, field };
}

const draft = 'Synthetic reply which must not be lost';

function type(field: HTMLElement) {
  fireEvent.change(field, { target: { value: draft } });
}

function submit(field: HTMLElement) {
  fireEvent.submit(field.closest('form')!);
}

describe('support reply navigation with a real data router', () => {
  it.each([400, 503])('preserves draft after action %s and delayed loader revalidation', async (status) => {
    const next = deferred<ReturnType<typeof fixture>>();

    const { router, field } = await setup(
      () => data({ errorCode: status === 400 ? 'rejected' : 'unavailable' }, { status }),
      () => next.promise,
    );
    type(field);
    submit(field);
    await waitFor(() => expect(router.state.navigation.state).toBe('loading'));
    expect(screen.getByRole('textbox')).toHaveValue(draft);
    await act(async () => next.resolve(fixture()));
    await waitFor(() => expect(router.state.navigation.state).toBe('idle'));
    expect(screen.getByRole('textbox')).toHaveValue(draft);
    fireEvent.click(screen.getByRole('link', { name: 'Back to support' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
  });
  it('retains the draft across locale-query GET revalidation', async () => {
    const next = deferred<ReturnType<typeof fixture>>();
    const { router, field } = await setup(undefined, () => next.promise);
    type(field);
    act(() => {
      void router.navigate('/support/ticket-1?lang=fr');
    });
    await waitFor(() => expect(router.state.navigation.state).toBe('loading'));
    expect(screen.getByRole('textbox')).toHaveValue(draft);
    await act(async () => next.resolve(fixture()));
    await waitFor(() => expect(router.state.navigation.state).toBe('idle'));
    expect(screen.getByRole('textbox')).toHaveValue(draft);
  });
  it('keeps the guard active while POST awaits acknowledgment and permits same-path submit', async () => {
    const response = deferred<ReturnType<typeof data>>();
    const { router, field } = await setup(() => response.promise);
    type(field);
    submit(field);
    await waitFor(() => expect(router.state.navigation.state).toBe('submitting'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Back to support' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
    await act(async () => response.resolve(data({ errorCode: 'unavailable' }, { status: 503 })));
  });
  it('lets empty replies leave, and supports cancel, Escape and explicit discard for dirty replies', async () => {
    const { router } = await setup();
    fireEvent.click(screen.getByRole('link', { name: 'Back to support' }));
    expect(await screen.findByText('Ticket list')).toBeVisible();
    await act(async () => router.navigate(-1));

    const reply = await screen.findByRole('textbox');
    type(reply);
    fireEvent.click(screen.getByRole('link', { name: 'Back to support' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(reply).toHaveValue(draft);
    fireEvent.click(screen.getByRole('link', { name: 'Back to support' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(reply).toHaveValue(draft);
    fireEvent.click(screen.getByRole('link', { name: 'Back to support' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard reply' }));
    expect(await screen.findByText('Ticket list')).toBeVisible();
  });
  it('clears a reply only after explicit success acknowledgment, retaining content during delayed reload', async () => {
    const response = deferred<ReturnType<typeof data>>();
    const next = deferred<ReturnType<typeof fixture>>();

    const { router, field } = await setup(
      () => response.promise,
      () => next.promise,
    );
    type(field);
    submit(field);
    await waitFor(() => expect(router.state.navigation.state).toBe('submitting'));
    expect(field).toHaveValue(draft);
    await act(async () => response.resolve(data({ sent: true })));
    await waitFor(() => expect(router.state.navigation.state).toBe('loading'));
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
    await act(async () => next.resolve(fixture()));
    await waitFor(() => expect(router.state.navigation.state).toBe('idle'));
    expect(screen.getByRole('textbox')).toHaveValue('');
    fireEvent.click(screen.getByRole('link', { name: 'Back to support' }));
    expect(await screen.findByText('Ticket list')).toBeVisible();
  });
});

describe('support explicit acknowledgment and draft identity', () => {
  it.each([400, 503])('preserves replies with the router default policy after action %s', async (status) => {
    const { router, field } = await setup(() => data({ errorCode: 'unavailable' }, { status }), undefined, false);
    type(field);
    await act(async () => submit(field));
    await waitFor(() => expect(router.state.navigation.state).toBe('idle'));
    expect(field).toHaveValue(draft);
    fireEvent.click(screen.getByRole('link', { name: 'Back to support' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
  });

  it('clears after a fast successful action even when loading renders coalesce', async () => {
    const { field } = await setup(() => data({ sent: true }));
    type(field);
    await act(async () => submit(field));
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
  });
  it('preserves edits made while POST is pending', async () => {
    const response = deferred<ReturnType<typeof data>>();
    const { router, field } = await setup(() => response.promise);
    type(field);
    submit(field);
    await waitFor(() => expect(router.state.navigation.state).toBe('submitting'));
    fireEvent.change(field, { target: { value: 'Additional unsent text' } });
    await act(async () => response.resolve(data({ sent: true })));
    await waitFor(() => expect(router.state.navigation.state).toBe('idle'));
    expect(field).toHaveValue('Additional unsent text');
    fireEvent.click(screen.getByRole('link', { name: 'Back to support' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
  });
  it('does not reuse a previous acknowledgment during a second submission', async () => {
    const second = deferred<ReturnType<typeof data>>();

    let calls = 0;

    const { router, field } = await setup(() => (++calls === 1 ? data({ sent: true }) : second.promise));
    type(field);
    submit(field);
    await waitFor(() => expect(field).toHaveValue(''));
    fireEvent.change(field, { target: { value: 'Second unsent reply' } });
    expect(field).toHaveValue('Second unsent reply');
    submit(field);
    await waitFor(() => expect(router.state.navigation.state).toBe('submitting'));
    expect(field).toHaveValue('Second unsent reply');
    await act(async () => second.resolve(data({ sent: true })));
    await waitFor(() => expect(field).toHaveValue(''));
    expect(calls).toBe(2);
  });
  it('keeps the draft after POST is aborted by a same-path locale GET', async () => {
    const response = deferred<ReturnType<typeof data>>();
    const { router, field } = await setup(() => response.promise);
    type(field);
    submit(field);
    await waitFor(() => expect(router.state.navigation.state).toBe('submitting'));
    await act(async () => {
      await router.navigate('/support/ticket-1?lang=fr');
    });
    expect(field).toHaveValue(draft);
    await act(async () => response.resolve(data({ sent: true })));
    expect(field).toHaveValue(draft);
  });
  it('does not resurrect explicitly discarded text when returning from another ticket', async () => {
    const { router, field } = await setup();
    type(field);
    act(() => {
      void router.navigate('/support/ticket-2');
    });
    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
    fireEvent.click(screen.getByRole('button', { name: 'Discard reply' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/support/ticket-2'));
    expect(screen.getByRole('textbox')).toHaveValue('');
    await act(async () => router.navigate(-1));
    expect(screen.getByRole('textbox')).toHaveValue('');
  });
});
