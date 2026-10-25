/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './projects.$projectId.domains';

vi.mock('~/lib/enterprise-api.server', async () => {
  const router = await import('react-router');
  return { apiRequest: vi.fn(), json: router.data, redirect: router.redirect };
});
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('~/components/dashboard/SaaSLayout', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('~/components/dashboard/UserAreaRouteError', () => ({ UserAreaRouteErrorBoundary: () => <p>Access error</p> }));
afterEach(cleanup);

function renderError(status: number, data: unknown) {
  const router = createMemoryRouter(
    [
      {
        id: 'domains',
        path: '/projects/:projectId/domains',
        element: <></>,
        errorElement: <ErrorBoundary />,
      },
    ],
    {
      initialEntries: ['/projects/isolated-project/domains'],
      hydrationData: { errors: { domains: { status, statusText: '', internal: false, data } } },
    },
  );
  render(<RouterProvider router={router} />);
}

describe('legacy domain mutation error recovery', () => {
  it('renders the existing diagnostic with a link to the canonical flow instead of a blank route', () => {
    renderError(400, { code: 'DOMAIN_ACTION_FAILED', error: 'DNS verification failed' });
    expect(screen.getByRole('alert').textContent).toBe('DNS verification failed');
    expect(screen.getByRole('link').getAttribute('href')).toBe('/projects/isolated-project/ide?panel=domains');
  });
  it('retains the existing generic authorization error boundary', () => {
    renderError(403, null);
    expect(screen.getByText('Access error')).toBeTruthy();
  });
});
