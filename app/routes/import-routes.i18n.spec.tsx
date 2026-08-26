/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from '@testing-library/react';
import type { FormEventHandler, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());
const firstOrganizationMock = vi.hoisted(() => vi.fn());
const firstOrganizationOrNullMock = vi.hoisted(() => vi.fn());

const routeState = vi.hoisted(() => ({
  actionData: undefined as unknown,
  loaderData: {
    language: 'fr',
    source: null as 'bolt' | 'lovable' | 'base44' | 'previous-agent-export' | null,
    repositoryUrl: '',
    branch: '',
    name: '',
  },
  navigationState: 'idle',
}));

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/enterprise-api.server')>();

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequestMock(...args),
    firstOrganization: (...args: unknown[]) => firstOrganizationMock(...args),
    firstOrganizationOrNull: (...args: unknown[]) => firstOrganizationOrNullMock(...args),
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
      onSubmit?: FormEventHandler;
    }) => (
      <form className={className} onSubmit={onSubmit}>
        {children}
      </form>
    ),
    useActionData: () => routeState.actionData,
    useLoaderData: () => routeState.loaderData,
    useNavigation: () => ({ state: routeState.navigationState }),
  };
});

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  AppShell: ({ title, description, children }: { title: string; description: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </main>
  ),
}));

import ImportGithubPage, { meta as gitMeta } from './import-github';
import ImportZipPage, { action as zipAction, meta as zipMeta } from './import-zip';
import ImportEmptyPage, { action as emptyAction, meta as emptyMeta } from './import.empty';
import { formatImportArchiveSize } from '~/lib/i18n/catalogs/import-routes';
import { createI18nInstance } from '~/lib/i18n/runtime';

function readData<T>(result: unknown): T {
  if (result && typeof result === 'object' && 'data' in result) {
    return (result as { data: T }).data;
  }

  return result as T;
}

afterEach(() => {
  cleanup();
  routeState.actionData = undefined;
  routeState.loaderData = { language: 'fr', source: null, repositoryUrl: '', branch: '', name: '' };
  routeState.navigationState = 'idle';
  apiRequestMock.mockReset();
  firstOrganizationMock.mockReset();
  firstOrganizationOrNullMock.mockReset();
});

describe('localized import routes', () => {
  it('switches the zip import surface live and formats French archive sizes', async () => {
    routeState.actionData = { errorCode: 'archiveRequired' };

    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <ImportZipPage />
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Importer une archive zip' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choisir un fichier' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Importer l’archive zip' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('Sélectionnez une archive zip avant de continuer.');
    expect(formatImportArchiveSize(19.5 * 1024 * 1024, 'fr')).toBe('19,5\u00a0Mo');

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('heading', { name: 'Import a zip archive' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose a file' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import the zip archive' })).toBeTruthy();
  });

  it('switches the empty-project surface live with safe quota copy', async () => {
    routeState.actionData = { errorCode: 'quota' };

    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <ImportEmptyPage />
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Projet vide' })).toBeTruthy();
    expect(screen.getByLabelText('Nom du projet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Créer le projet vide' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('limite de projets');

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('heading', { name: 'Empty project' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create the empty project' })).toBeTruthy();
  });

  it('switches the Git import surface live without translating brands or branch names', async () => {
    routeState.actionData = { errorCode: 'inaccessible' };
    routeState.loaderData.repositoryUrl = 'https://github.com/acme/imported-app';
    routeState.loaderData.branch = 'release/v2';
    routeState.loaderData.name = 'Imported app';

    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <ImportGithubPage />
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Importer un dépôt Git' })).toBeTruthy();
    expect(screen.getByLabelText('URL du dépôt')).toBeTruthy();
    expect((screen.getByLabelText('URL du dépôt') as HTMLInputElement).value).toBe(
      'https://github.com/acme/imported-app',
    );
    expect((screen.getByLabelText('Branche') as HTMLInputElement).value).toBe('release/v2');
    expect((screen.getByLabelText('Nom du projet') as HTMLInputElement).value).toBe('Imported app');
    expect((screen.getByLabelText('Branche') as HTMLInputElement).placeholder).toBe('main');
    expect(screen.getByText(/GitHub, GitLab ou Bitbucket/u)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).not.toContain('upstream');

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('heading', { name: 'Import a Git repository' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import the repository' })).toBeTruthy();
  });

  it('emits localized SEO, canonical and hreflang metadata for every route', () => {
    const cases = [
      [zipMeta, 'Importer une archive zip - E-Code', 'https://e-code.ai/import-zip'],
      [emptyMeta, 'Créer un projet vide - E-Code', 'https://e-code.ai/import/empty'],
      [gitMeta, 'Importer un dépôt Git - E-Code', 'https://e-code.ai/import-github'],
    ] as const;

    for (const [meta, title, canonical] of cases) {
      const tags = meta({ data: { language: 'fr' }, matches: [] } as never);

      expect(tags).toContainEqual({ title });
      expect(tags).toContainEqual({ property: 'og:locale', content: 'fr_FR' });
      expect(tags).toContainEqual({ tagName: 'link', rel: 'canonical', href: canonical });
      expect(tags).toContainEqual({
        tagName: 'link',
        rel: 'alternate',
        hrefLang: 'fr',
        href: `${canonical}?lang=fr`,
      });
    }
  });

  it('returns stable localized-action codes and never forwards an upstream project error', async () => {
    firstOrganizationMock.mockResolvedValue({ id: 'org-1', slug: 'acme' });
    apiRequestMock.mockRejectedValue(
      new Response(JSON.stringify({ error: 'Private billing cluster failed with secret detail.' }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const emptyRequest = new Request('https://e-code.ai/import/empty', {
      method: 'POST',
      headers: {
        'accept-language': 'fr-FR,fr;q=0.9',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ name: 'Projet test' }).toString(),
    });

    const emptyResult = await emptyAction({ request: emptyRequest } as never);

    const zipRequest = new Request('https://e-code.ai/import-zip', {
      method: 'POST',
      headers: {
        'accept-language': 'fr-FR,fr;q=0.9',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams().toString(),
    });

    const zipResult = await zipAction({ request: zipRequest } as never);

    expect(readData(emptyResult)).toEqual({ errorCode: 'createFailed' });
    expect(JSON.stringify(readData(emptyResult))).not.toContain('Private billing cluster');
    expect((emptyResult as { init?: { headers?: Headers } }).init?.headers?.get('Content-Language')).toBe('fr');
    expect(readData(zipResult)).toEqual({ errorCode: 'archiveRequired' });
    expect((zipResult as { init?: { headers?: Headers } }).init?.headers?.get('Content-Language')).toBe('fr');
  });
});
