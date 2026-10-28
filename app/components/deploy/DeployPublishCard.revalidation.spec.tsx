/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, waitFor, act } from '@testing-library/react';
import { Request as FetchRequest } from 'node-fetch';
import { useState } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DeployPublishCard, deploymentDrafts } from './DeployPublishCard';
import { getProjectDeploymentsCopy } from '~/lib/i18n/catalogs/project-user-area';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string) => key }) }));
beforeEach(() => vi.stubGlobal('Request', FetchRequest));
afterEach(() => {
  cleanup();
  deploymentDrafts.clear();
  vi.unstubAllGlobals();
});

it('canonical keyed scope waits for the new workspace detection', async () => {
  let release!: () => void;
  let reached = false;

  const barrier = new Promise<void>((r) => {
    release = r;
  });

  const submit = vi.fn();

  function Harness() {
    const [workspace, setWorkspace] = useState('a');
    return (
      <>
        <button onClick={() => setWorkspace('b')}>Switch</button>
        <DeployPublishCard
          key={workspace}
          projectId="isolated"
          workspaceId={workspace}
          busy={false}
          building={false}
          onSubmit={submit}
        />
      </>
    );
  }

  const router = createMemoryRouter([
    { path: '/', element: <Harness /> },
    {
      path: '/projects/isolated/deployments',
      loader: async ({ request }) => {
        const u = new URL(request.url);

        if (u.searchParams.has('rateCard')) {
          return { rateCard: null };
        }

        if (u.searchParams.get('workspace') === 'b') {
          reached = true;
          await barrier;

          return { detected: { mode: 'static', framework: 'b', reason: '' } };
        }

        return { detected: { mode: 'server', framework: 'a', reason: '' } };
      },
    },
  ]);

  const view = render(<RouterProvider router={router} />);
  const button = () => view.container.querySelector('button[type="submit"]') as HTMLButtonElement;
  await waitFor(() => expect(button().disabled).toBe(false));
  fireEvent.click(view.getByText('Switch'));
  await waitFor(() => expect(reached).toBe(true));

  try {
    expect(button().disabled).toBe(true);
  } finally {
    await act(async () => release());
    router.dispose();
  }
});
it('explicit override remains available while first detection is pending', async () => {
  let release!: () => void;

  const barrier = new Promise<void>((r) => {
    release = r;
  });
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <DeployPublishCard projectId="isolated" workspaceId="b" busy={false} building={false} onSubmit={vi.fn()} />
      ),
    },
    {
      path: '/projects/isolated/deployments',
      loader: async ({ request }) => {
        if (new URL(request.url).searchParams.has('rateCard')) {
          return { rateCard: null };
        }

        await barrier;

        return { detected: { mode: 'unknown', framework: '', reason: '' } };
      },
    },
  ]);

  const view = render(<RouterProvider router={router} />);
  fireEvent.click(view.container.querySelector('input[type="radio"][value="static"]')!);
  await waitFor(() =>
    expect((view.container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false),
  );
  await act(async () => release());
  router.dispose();
});
it('automatic publication waits for router revalidation of detection in the same scope', async () => {
  let release!: () => void;
  let calls = 0;

  const barrier = new Promise<void>((r) => {
    release = r;
  });

  const submit = vi.fn();

  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <DeployPublishCard projectId="isolated" workspaceId="a" busy={false} building={false} onSubmit={submit} />
      ),
    },
    {
      path: '/projects/isolated/deployments',
      loader: async ({ request }) => {
        if (new URL(request.url).searchParams.has('rateCard')) {
          return { rateCard: null };
        }

        calls++;

        if (calls > 1) {
          await barrier;
        }

        return { detected: { mode: calls > 1 ? 'static' : 'server', framework: 'fixture', reason: '' } };
      },
    },
  ]);

  const view = render(<RouterProvider router={router} />);
  const button = () => view.container.querySelector('button[type="submit"]') as HTMLButtonElement;
  await waitFor(() => expect(button().disabled).toBe(false));
  act(() => {
    void router.revalidate();
  });
  await waitFor(() => expect(calls).toBe(2));

  try {
    expect(router.state.revalidation).toBe('loading');
    expect(button().disabled).toBe(true);
    expect(view.getByText(getProjectDeploymentsCopy('en').publish.detecting)).toBeTruthy();
    fireEvent.submit(view.container.querySelector('form')!);
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(view.container.querySelector('input[type="radio"][value="static"]')!);
    expect(button().disabled).toBe(false);
    expect(view.queryByText(getProjectDeploymentsCopy('en').publish.detecting)).toBeNull();
    await act(async () => fireEvent.submit(view.container.querySelector('form')!));
    expect(submit).toHaveBeenCalledTimes(1);
    expect((submit.mock.calls[0][0] as FormData).get('provider')).toBe('static');
    fireEvent.click(view.container.querySelector('input[type="radio"][value="auto"]')!);
    expect(button().disabled).toBe(true);
    await act(async () => release());
    await waitFor(() => expect(button().disabled).toBe(false));
    expect(view.queryByText(getProjectDeploymentsCopy('en').publish.detecting)).toBeNull();
    expect((view.container.querySelector('[name="provider"]') as HTMLInputElement).value).toBe('static');
  } finally {
    release();
    router.dispose();
  }
});
