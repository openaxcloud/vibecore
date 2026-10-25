/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './projects.$projectId.deployments';

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
        path: '/projects/:projectId/deployments',
        element: <></>,
        errorElement: <ErrorBoundary />,
      },
    ],
    {
      initialEntries: ['/projects/isolated-project/deployments'],
      hydrationData: { errors: { domains: { status, statusText: '', internal: false, data } } },
    },
  );
  render(<RouterProvider router={router} />);
}

describe('legacy deployment mutation error recovery', () => {
  it('renders the existing diagnostic with a link to the canonical flow instead of a blank route', () => {
    renderError(400, {
      code: 'DEPLOYMENT_ACTION_FAILED',
      error: 'Deployment was refused',
      workspaceId: 'original-workspace',
    });
    expect(screen.getByRole('alert').textContent).toBe('Deployment was refused');
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      '/projects/isolated-project/ide?panel=deployments&workspace=original-workspace',
    );
  });
  it('retains the existing generic authorization error boundary', () => {
    renderError(403, null);
    expect(screen.getByText('Access error')).toBeTruthy();
  });
});
