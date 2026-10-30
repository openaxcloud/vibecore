/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { Request as FetchRequest } from 'node-fetch';
import { createMemoryRouter, RouterProvider, useParams } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DeployPublishCard, deploymentDrafts } from './DeployPublishCard';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string) => key }) }));
beforeEach(() => vi.stubGlobal('Request', FetchRequest));
afterEach(() => {
  cleanup();
  deploymentDrafts.clear();
  vi.unstubAllGlobals();
});

it('keeps the publication target and draft isolated across A to B to A with late B detection', async () => {
  let releaseB!: () => void;
  let bRequested = false;

  const delayedB = new Promise<void>((resolve) => {
    releaseB = resolve;
  });

  const submitted = vi.fn();

  function Harness() {
    const { projectId = '' } = useParams();
    const workspaceId = `workspace-${projectId}`;

    return (
      <DeployPublishCard
        key={`${projectId}:${workspaceId}`}
        projectId={projectId}
        workspaceId={workspaceId}
        busy={false}
        building={false}
        onSubmit={(form) => submitted(projectId, Object.fromEntries(form))}
      />
    );
  }

  const router = createMemoryRouter(
    [
      { path: '/ide/:projectId', element: <Harness /> },
      {
        path: '/projects/:projectId/deployments',
        loader: async ({ request, params }) => {
          if (new URL(request.url).searchParams.has('rateCard')) {
            return { rateCard: null };
          }

          if (params.projectId === 'b') {
            bRequested = true;
            await delayedB;
          }

          return {
            detected: {
              mode: params.projectId === 'a' ? 'static' : 'server',
              framework: `fixture-${params.projectId}`,
              reason: '',
            },
          };
        },
      },
    ],
    { initialEntries: ['/ide/a'] },
  );

  const view = render(<RouterProvider router={router} />);
  const submit = () => view.container.querySelector('button[type="submit"]') as HTMLButtonElement;
  const domain = () => view.container.querySelector('input[name="customDomain"]') as HTMLInputElement;

  try {
    await waitFor(() => expect(submit().disabled).toBe(false));
    fireEvent.change(domain(), { target: { value: 'a.example.invalid' } });
    await act(async () => {
      await router.navigate('/ide/b');
    });
    await waitFor(() => expect(bRequested).toBe(true));
    expect(submit().disabled).toBe(true);
    expect(domain().value).toBe('');
    fireEvent.change(domain(), { target: { value: 'b.example.invalid' } });
    fireEvent.submit(view.container.querySelector('form')!);
    expect(submitted).not.toHaveBeenCalled();
    await act(async () => {
      await router.navigate(-1);
    });
    await waitFor(() => expect(submit().disabled).toBe(false));
    expect(domain().value).toBe('a.example.invalid');
    await act(async () => {
      releaseB();
    });
    expect(view.queryByText('fixture-b')).toBeNull();
    expect(view.getByText('fixture-a')).toBeTruthy();
    await act(async () => {
      fireEvent.submit(view.container.querySelector('form')!);
      fireEvent.submit(view.container.querySelector('form')!);
    });
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(submitted).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ workspaceId: 'workspace-a', provider: 'static', customDomain: 'a.example.invalid' }),
    );
    await act(async () => {
      await router.navigate('/ide/b');
    });
    await waitFor(() => expect(submit().disabled).toBe(false));
    expect(domain().value).toBe('b.example.invalid');
    await act(async () => {
      fireEvent.submit(view.container.querySelector('form')!);
    });
    expect(submitted).toHaveBeenLastCalledWith(
      'b',
      expect.objectContaining({ workspaceId: 'workspace-b', provider: 'server', customDomain: 'b.example.invalid' }),
    );
  } finally {
    releaseB();
    router.dispose();
  }
});
