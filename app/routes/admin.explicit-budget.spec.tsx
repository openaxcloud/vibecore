/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Request as FetchRequest } from 'node-fetch';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AdminExplicitBudgetPage from './admin.explicit-budget';
import type {
  AdminExplicitBudgetActionData,
  AdminExplicitBudgetLoaderData,
  AdminExplicitBudgetSnapshot,
} from '~/lib/.server/admin-explicit-budget';
import { getAdminExplicitBudgetCopy } from '~/lib/i18n/catalogs/admin-explicit-budget';

vi.mock('~/lib/.server/admin-explicit-budget', () => ({
  loadAdminExplicitBudget: vi.fn(() => {
    throw new Error('Real administrative loader forbidden');
  }),
  actionAdminExplicitBudget: vi.fn(() => {
    throw new Error('Real administrative mutation forbidden');
  }),
}));
vi.mock('~/components/dashboard/SaaSLayout', () => ({
  AppShell: ({ title, description, children }: { title: string; description: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </main>
  ),
}));
vi.mock('~/components/dashboard/UserAreaRouteError', () => ({ UserAreaRouteErrorBoundary: () => null }));

const snapshot = (overrides: Partial<AdminExplicitBudgetSnapshot> = {}): AdminExplicitBudgetSnapshot => ({
  projectId: 'isolated-fixture-project',
  organizationSlug: 'isolated-fixture-organization',
  summary: { limitMicros: 20_000_000, reservedMicros: 15_260_000, remainingMicros: 4_740_000 },
  grantApplied: false,
  eligible: true,
  reviewToken: 'isolated-review-token',
  permit: {
    provider: 'openai',
    model: 'gpt-5.6-luna',
    serviceTier: 'default',
    maxCalls: 2,
    reservedBudgetMicros: 15_260_000,
  },
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

const routers: ReturnType<typeof createMemoryRouter>[] = [];
const network = vi.fn();
beforeEach(() => {
  network.mockReset();
  network.mockImplementation(() => {
    throw new Error('External network forbidden');
  });
  vi.stubGlobal('fetch', network);
  vi.stubGlobal('Request', FetchRequest);
});
afterEach(() => {
  cleanup();
  routers.splice(0).forEach((router) => router.dispose());
  vi.unstubAllGlobals();
});

async function mount(language: 'en' | 'fr' = 'en', initial: AdminExplicitBudgetSnapshot | null = snapshot()) {
  const data: AdminExplicitBudgetLoaderData = { language, snapshot: initial };
  const load = vi.fn(async () => data);

  const submit = vi.fn(
    async (_request: Request): Promise<AdminExplicitBudgetActionData> => ({ ok: false, issue: 'outcome-unknown' }),
  );
  const router = createMemoryRouter(
    [
      {
        path: '/admin/explicit-budget',
        HydrateFallback: () => null,
        loader: () => load(),
        action: ({ request }) => submit(request),
        element: <AdminExplicitBudgetPage />,
      },
    ],
    { initialEntries: ['/admin/explicit-budget'] },
  );
  routers.push(router);
  render(<RouterProvider router={router} />);

  const copy = getAdminExplicitBudgetCopy(language);
  await screen.findByRole('heading', { name: copy['adminExplicitBudget.title'] });

  return { data, load, submit, router, copy };
}

function authorize(copy: ReturnType<typeof getAdminExplicitBudgetCopy>) {
  fireEvent.click(screen.getByRole('checkbox', { name: copy['adminExplicitBudget.confirmation'] }));

  const password = screen.getByLabelText(copy['adminExplicitBudget.password']) as HTMLInputElement;
  fireEvent.change(password, { target: { value: 'synthetic-password-only' } });

  return password;
}

it.each(['en', 'fr'] as const)('mounts read-only with real %s copy and no mutation or network', async (language) => {
  const { load, submit, copy } = await mount(language);
  expect(load).toHaveBeenCalledTimes(1);
  expect(submit).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
  expect(screen.getByText(copy['adminExplicitBudget.unknownCosts'])).toBeTruthy();
  expect(screen.getByText(copy['adminExplicitBudget.constraint'])).toBeTruthy();
  expect(screen.getByText(copy['adminExplicitBudget.proposal'])).toBeTruthy();
  expect(screen.getByText(copy['adminExplicitBudget.nextRun']).nextElementSibling?.textContent).toBe(
    new Intl.NumberFormat(language, { style: 'currency', currency: 'USD' }).format(15.26),
  );
  expect(screen.getByText(copy['adminExplicitBudget.calls']).nextElementSibling?.textContent).toBe('2');
  expect(screen.getByText(copy['adminExplicitBudget.model']).nextElementSibling?.textContent).toContain(
    'openai / gpt-5.6-luna',
  );
  expect(
    (screen.getByRole('button', { name: copy['adminExplicitBudget.activate'] }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.queryByText(copy['adminExplicitBudget.granted'])).toBeNull();
});

it('requires both explicit confirmation and a nonempty password before the browser submits', async () => {
  const { submit, copy } = await mount();
  const activate = screen.getByRole('button', { name: copy['adminExplicitBudget.activate'] });
  fireEvent.click(activate);
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox', { name: copy['adminExplicitBudget.confirmation'] }));

  const password = screen.getByLabelText(copy['adminExplicitBudget.password']) as HTMLInputElement;
  expect(password.required).toBe(true);
  expect(password.checkValidity()).toBe(false);
  fireEvent.click(activate);
  expect(submit).not.toHaveBeenCalled();
  fireEvent.change(password, { target: { value: 'synthetic-password-only' } });
  fireEvent.click(activate);
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));

  const payload = await submit.mock.calls[0][0].formData();
  expect(payload.get('confirmed')).toBe('yes');
  expect(payload.get('reviewToken')).toBe('isolated-review-token');
  expect(payload.get('password')).toBe('synthetic-password-only');
});

it('clears the submitted password and prevents another submission while the result is pending', async () => {
  const { submit, copy } = await mount();
  const pending = deferred<AdminExplicitBudgetActionData>();
  submit.mockImplementationOnce(() => pending.promise);

  const password = authorize(copy);
  fireEvent.click(screen.getByRole('button', { name: copy['adminExplicitBudget.activate'] }));
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  expect(password.value).toBe('');
  expect(screen.queryByRole('button', { name: copy['adminExplicitBudget.activate'] })).toBeNull();
  expect(
    (screen.getByRole('button', { name: copy['adminExplicitBudget.refresh'] }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.queryByText(copy['adminExplicitBudget.granted'])).toBeNull();
  pending.resolve({ ok: false, issue: 'outcome-unknown' });
  await screen.findByText(copy['adminExplicitBudget.outcome-unknown']);
});

it('keeps an unknown outcome blocked without success or automatic resubmission, then requires a verified manual read', async () => {
  const { submit, load, data, copy } = await mount();
  authorize(copy);
  fireEvent.click(screen.getByRole('button', { name: copy['adminExplicitBudget.activate'] }));
  await screen.findByText(copy['adminExplicitBudget.outcome-unknown']);
  expect(submit).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(copy['adminExplicitBudget.granted'])).toBeNull();
  expect(screen.queryByRole('button', { name: copy['adminExplicitBudget.activate'] })).toBeNull();

  const read = deferred<AdminExplicitBudgetLoaderData>();
  load.mockImplementationOnce(() => read.promise);
  fireEvent.click(screen.getByRole('button', { name: copy['adminExplicitBudget.refresh'] }));
  expect(screen.queryByRole('button', { name: copy['adminExplicitBudget.activate'] })).toBeNull();
  expect(submit).toHaveBeenCalledTimes(1);
  read.resolve({ ...data, snapshot: snapshot({ reviewToken: 'new-verified-review' }) });
  await screen.findByRole('button', { name: copy['adminExplicitBudget.activate'] });
  expect(screen.queryByText(copy['adminExplicitBudget.outcome-unknown'])).toBeNull();
  expect(
    (screen.getByRole('checkbox', { name: copy['adminExplicitBudget.confirmation'] }) as HTMLInputElement).checked,
  ).toBe(false);
  expect((screen.getByLabelText(copy['adminExplicitBudget.password']) as HTMLInputElement).value).toBe('');
  expect(
    (screen.getByRole('button', { name: copy['adminExplicitBudget.activate'] }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(document.querySelector<HTMLInputElement>('input[name="reviewToken"]')?.value).toBe('new-verified-review');
  expect(submit).toHaveBeenCalledTimes(1);
});

it('does not restore eligibility after an unverifiable manual read', async () => {
  const { submit, load, data, copy } = await mount();
  authorize(copy);
  fireEvent.click(screen.getByRole('button', { name: copy['adminExplicitBudget.activate'] }));
  await screen.findByText(copy['adminExplicitBudget.outcome-unknown']);
  load.mockResolvedValueOnce({ ...data, snapshot: null, issue: 'unavailable' });
  fireEvent.click(screen.getByRole('button', { name: copy['adminExplicitBudget.refresh'] }));
  await screen.findByText(copy['adminExplicitBudget.unavailable']);
  expect(screen.queryByRole('button', { name: copy['adminExplicitBudget.activate'] })).toBeNull();
  expect(screen.queryByText(copy['adminExplicitBudget.granted'])).toBeNull();
  expect(submit).toHaveBeenCalledTimes(1);
});

it.each([
  snapshot({
    grantApplied: true,
    eligible: false,
    summary: { limitMicros: 30_520_000, reservedMicros: 15_260_000, remainingMicros: 15_260_000 },
  }),
  snapshot({
    grantApplied: true,
    eligible: false,
    summary: { limitMicros: 30_520_000, reservedMicros: 30_520_000, remainingMicros: 0 },
  }),
  snapshot({ eligible: false }),
])('does not offer another extension for a granted or consumed snapshot', async (state) => {
  const { submit, copy } = await mount('en', state);
  expect(screen.queryByRole('button', { name: copy['adminExplicitBudget.activate'] })).toBeNull();
  expect(screen.queryByLabelText(copy['adminExplicitBudget.password'])).toBeNull();
  expect(submit).not.toHaveBeenCalled();

  if (state.grantApplied) {
    expect(screen.getByText(copy['adminExplicitBudget.granted'])).toBeTruthy();
  } else {
    expect(screen.getByText(copy['adminExplicitBudget.blocked'])).toBeTruthy();
  }
});

it('drops an old action success when a later verified loader no longer confirms it', async () => {
  const { submit, load, data, copy } = await mount();
  submit.mockResolvedValueOnce({ ok: true, snapshot: snapshot({ grantApplied: true, eligible: false }) });
  authorize(copy);
  fireEvent.click(screen.getByRole('button', { name: copy['adminExplicitBudget.activate'] }));
  await screen.findByText(copy['adminExplicitBudget.granted']);
  load.mockResolvedValueOnce({ ...data, snapshot: snapshot({ eligible: false, grantApplied: false }) });
  fireEvent.click(screen.getByRole('button', { name: copy['adminExplicitBudget.refresh'] }));
  await screen.findByText(copy['adminExplicitBudget.blocked']);
  expect(screen.queryByText(copy['adminExplicitBudget.granted'])).toBeNull();
  expect(screen.queryByRole('button', { name: copy['adminExplicitBudget.activate'] })).toBeNull();
  expect(submit).toHaveBeenCalledTimes(1);
});

it('clears a typed password immediately when a manual state read begins', async () => {
  const { load, data, copy } = await mount();
  const password = authorize(copy);
  const read = deferred<AdminExplicitBudgetLoaderData>();
  load.mockImplementationOnce(() => read.promise);
  fireEvent.click(screen.getByRole('button', { name: copy['adminExplicitBudget.refresh'] }));
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: copy['adminExplicitBudget.refresh'] }) as HTMLButtonElement).disabled,
    ).toBe(true),
  );
  expect(password.value).toBe('');
  read.resolve(data);
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: copy['adminExplicitBudget.refresh'] }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
});

it('does not announce success for an unknown outcome even when its returned snapshot has a grant flag', async () => {
  const { submit, copy } = await mount();
  submit.mockResolvedValueOnce({
    ok: false,
    issue: 'outcome-unknown',
    snapshot: snapshot({ grantApplied: true, eligible: false }),
  });
  authorize(copy);
  fireEvent.click(screen.getByRole('button', { name: copy['adminExplicitBudget.activate'] }));
  await screen.findByText(copy['adminExplicitBudget.outcome-unknown']);
  expect(screen.queryByText(copy['adminExplicitBudget.granted'])).toBeNull();
  expect(screen.queryByRole('button', { name: copy['adminExplicitBudget.activate'] })).toBeNull();
  expect(submit).toHaveBeenCalledTimes(1);
});
