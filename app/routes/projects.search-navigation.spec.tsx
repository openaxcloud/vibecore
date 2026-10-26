/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Request as FetchRequest } from 'node-fetch';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import ProjectsPage from './projects._index';
import { createI18nInstance } from '~/lib/i18n/runtime';
vi.mock('~/components/dashboard/SaaSLayout', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  ProjectGrid: () => null,
  ProjectPreviewMedia: () => null,
  ProjectStatusPill: () => null,
  LinkButton: () => null,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderProjects(initialEntry = '/projects?q=Alpha', navigationDelay = 0) {
  let loadCount = 0;
  vi.stubGlobal('Request', FetchRequest);

  const router = createMemoryRouter(
    [
      {
        path: '/projects',
        loader: async () => {
          if (loadCount++ > 0 && navigationDelay) {
            await new Promise((resolve) => setTimeout(resolve, navigationDelay));
          }

          return { projects: [], failedOrganizationCount: 0, organizationCount: 1 };
        },
        Component: ProjectsPage,
        HydrateFallback: () => null,
      },
    ],
    { initialEntries: [initialEntry] },
  );
  render(
    <I18nextProvider i18n={createI18nInstance('en')}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );

  const input = (await screen.findByRole('textbox')) as HTMLInputElement;

  return { router, input };
}

it('restores the query on same-route navigation and Back/Forward', async () => {
  const { router, input } = await renderProjects();
  expect((input as HTMLInputElement).value).toBe('Alpha');
  await act(() => router.navigate('/projects?q=Beta'));
  await waitFor(() => expect((input as HTMLInputElement).value).toBe('Beta'));
  await act(() => router.navigate(-1));
  await waitFor(() => expect((input as HTMLInputElement).value).toBe('Alpha'));
  await act(() => router.navigate(1));
  await waitFor(() => expect(input.value).toBe('Beta'));
  router.dispose();
});

it('preserves typed whitespace while debouncing its trimmed URL value', async () => {
  const { router, input } = await renderProjects('/projects?lang=fr&status=draft');
  fireEvent.change(input, { target: { value: ' Alpha ' } });
  await waitFor(() => expect(new URLSearchParams(router.state.location.search).get('q')).toBe('Alpha'));
  expect(input.value).toBe(' Alpha ');
  expect(new URLSearchParams(router.state.location.search).get('lang')).toBe('fr');
  expect(new URLSearchParams(router.state.location.search).get('status')).toBe('draft');
  router.dispose();
});

it('does not overwrite navigation with a pending typed query', async () => {
  const { router, input } = await renderProjects();
  fireEvent.change(input, { target: { value: 'unsent draft' } });
  await act(() => router.navigate('/projects?q=Gamma&status=draft'));
  await waitFor(() => expect(input.value).toBe('Gamma'));
  await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
  expect(new URLSearchParams(router.state.location.search).get('q')).toBe('Gamma');
  expect(new URLSearchParams(router.state.location.search).get('status')).toBe('draft');
  router.dispose();
});

it('does not let the debounce cancel a slower navigation that clears the query', async () => {
  const { router, input } = await renderProjects('/projects?q=Alpha', 300);
  await act(() => router.navigate('/projects'));
  await waitFor(() => expect(input.value).toBe(''));
  expect(router.state.location.search).toBe('');
  await act(() => router.navigate(-1));
  await waitFor(() => expect(input.value).toBe('Alpha'));
  await act(() => router.navigate(1));
  await waitFor(() => expect(input.value).toBe(''));
  router.dispose();
});

it('keeps newer typing when an earlier debounced query finishes loading', async () => {
  const { router, input } = await renderProjects('/projects', 300);
  fireEvent.change(input, { target: { value: 'A' } });
  await waitFor(() => expect(router.state.navigation.state).toBe('loading'));
  fireEvent.change(input, { target: { value: 'AB' } });
  await waitFor(() => expect(new URLSearchParams(router.state.location.search).get('q')).toBe('AB'), {
    timeout: 2000,
  });
  expect(input.value).toBe('AB');
  router.dispose();
});

it('keeps a pending draft when switching the local status filter', async () => {
  const { router, input } = await renderProjects('/projects', 300);
  fireEvent.change(input, { target: { value: 'Alpha ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
  await waitFor(() => expect(new URLSearchParams(router.state.location.search).get('q')).toBe('Alpha'), {
    timeout: 2000,
  });
  expect(input.value).toBe('Alpha ');
  expect(new URLSearchParams(router.state.location.search).get('status')).toBe('draft');
  router.dispose();
});

it('clears an uncommitted draft when a link navigates to the current unfiltered URL', async () => {
  const { router, input } = await renderProjects('/projects', 300);
  fireEvent.change(input, { target: { value: 'pending draft' } });

  let completed: Promise<void>;

  // Flush the pending navigation render before waiting for its deferred loader.
  await act(async () => {
    completed = router.navigate('/projects');
  });
  await act(() => completed!);
  await waitFor(() => expect(input.value).toBe(''));
  router.dispose();
});

it('distinguishes an explicit PUSH from a pending local write to the same query', async () => {
  const { router, input } = await renderProjects('/projects', 300);
  fireEvent.change(input, { target: { value: 'A' } });
  await waitFor(() => expect(router.state.navigation.state).toBe('loading'));
  fireEvent.change(input, { target: { value: 'AB' } });

  let completed: Promise<void>;

  await act(async () => {
    completed = router.navigate('/projects?q=A');
  });
  await act(() => completed!);
  await waitFor(() => expect(input.value).toBe('A'));
  expect(new URLSearchParams(router.state.location.search).get('q')).toBe('A');
  router.dispose();
});
