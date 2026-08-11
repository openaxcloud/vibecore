/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FormHTMLAttributes, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const submitMock = vi.hoisted(() => vi.fn());

const routeState = vi.hoisted(() => ({
  actionData: undefined as unknown,
  loaderData: undefined as unknown,
  navigationState: 'idle',
}));

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/enterprise-api.server')>();

  return { ...actual, apiRequest: (...args: unknown[]) => apiRequestMock(...args) };
});
vi.mock('@radix-ui/react-dialog', () => ({ Root: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  const FormComponent = ({ children, ...props }: FormHTMLAttributes<HTMLFormElement>) => (
    <form {...props}>{children}</form>
  );

  return {
    ...actual,
    Form: FormComponent,
    useActionData: () => routeState.actionData,
    useLoaderData: () => routeState.loaderData,
    useNavigate: () => navigateMock,
    useNavigation: () => ({ state: routeState.navigationState }),
    useFetcher: () => ({
      Form: FormComponent,
      data: undefined,
      state: 'idle',
      submit: submitMock,
    }),
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
vi.mock('~/components/ui/Button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock('~/components/ui/Dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

import ProjectSettingsPage, { action, meta } from './projects.$projectId.settings';
import { createI18nInstance } from '~/lib/i18n/runtime';

function renderPage(language: 'en' | 'fr') {
  routeState.loaderData = {
    project: {
      id: 'project-1',
      name: 'Northwind Studio',
      slug: 'northwind-studio',
      description: 'Customer-authored description',
      gitRepositoryUrl: 'https://github.com/customer/northwind',
      gitDefaultBranch: 'main',
    },
  };
  routeState.actionData = undefined;
  routeState.navigationState = 'idle';

  return render(
    <I18nextProvider i18n={createI18nInstance(language)}>
      <ProjectSettingsPage />
    </I18nextProvider>,
  );
}

afterEach(() => {
  cleanup();
  apiRequestMock.mockReset();
  navigateMock.mockReset();
  submitMock.mockReset();
});

describe('project settings i18n', () => {
  it('renders every project setting and destructive control in French', () => {
    renderPage('fr');

    expect(screen.getByRole('heading', { name: 'Paramètres du projet' })).toBeTruthy();
    expect((screen.getByLabelText('Nom du projet') as HTMLInputElement).value).toBe('Northwind Studio');
    expect((screen.getByLabelText('URL du dépôt Git') as HTMLInputElement).value).toBe(
      'https://github.com/customer/northwind',
    );
    expect(screen.getByRole('heading', { name: 'Identifiant de l’URL du projet' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Zone sensible' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enregistrer les modifications' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mettre à jour l’identifiant' })).toBeTruthy();
    expect(screen.queryByText('Project settings')).toBeNull();
    expect(screen.queryByText('Danger zone')).toBeNull();
  });

  it('localizes the confirmation dialog while preserving the exact project name', () => {
    renderPage('fr');
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer ce projet' }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Supprimer.*Northwind Studio/u })).toBeTruthy();
    expect(screen.getByLabelText('Saisissez le nom du projet pour confirmer sa suppression')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Supprimer le projet' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('masks raw API errors and localizes metadata and action feedback', async () => {
    apiRequestMock.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'Raw backend project settings failure' }), { status: 409 }),
    );

    const request = new Request('https://e-code.ai/projects/project-1/settings', {
      method: 'POST',
      headers: {
        'accept-language': 'fr-FR,fr;q=0.9',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ intent: 'rename-slug', slug: 'already-used' }).toString(),
    });
    const result = (await action({ request, params: { projectId: 'project-1' }, context: {} } as never)) as {
      data: { error?: string };
    };

    expect(result.data.error).toBe('Cette URL de projet est déjà utilisée. Choisissez un autre identifiant.');
    expect(result.data.error).not.toContain('Raw backend project settings failure');
    expect(
      meta({
        data: undefined,
        location: {} as never,
        params: {},
        matches: [{ id: 'root', data: { language: 'fr' } }] as never,
      })?.[0],
    ).toEqual({ title: 'Paramètres du projet - E-Code' });
  });

  it('keeps the complete English catalog available', () => {
    renderPage('en');

    expect(screen.getByRole('heading', { name: 'Project settings' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Project URL slug' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Danger zone' })).toBeTruthy();
  });
});
