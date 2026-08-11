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

import ImportSpreadsheetPage, { action, loader, meta } from './import.spreadsheet';
import { createI18nInstance } from '~/lib/i18n/runtime';

function readData<T>(result: unknown): T {
  if (result && typeof result === 'object' && 'data' in result) {
    return (result as { data: T }).data;
  }

  return result as T;
}

function formRequest(fields: Record<string, string>, language = 'fr') {
  return new Request(`https://e-code.ai/import/spreadsheet?lang=${language}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
}

afterEach(() => {
  cleanup();
  apiRequestMock.mockReset();
  firstOrganizationMock.mockReset();
  firstOrganizationOrNullMock.mockReset();
  routeState.actionData = undefined;
  routeState.navigationState = 'idle';
});

describe('spreadsheet import i18n', () => {
  it('renders and switches all form copy while preserving the CSV format', async () => {
    routeState.actionData = { errorCode: 'dataRequired' };

    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <ImportSpreadsheetPage />
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Importer une feuille de calcul' })).toBeTruthy();
    expect(screen.getByLabelText('Nom du projet')).toBeTruthy();
    expect(screen.getByLabelText('Données CSV ou TSV')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Créer l’application de données' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('Collez des données CSV ou TSV avant de continuer.');
    expect(screen.getByPlaceholderText(/nom,rôle,ville/u)).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('heading', { name: 'Import a spreadsheet' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create the data application' })).toBeTruthy();
    expect(screen.getByPlaceholderText(/name,role,city/u)).toBeTruthy();
  });

  it('returns a localized loader language with locale response headers', async () => {
    firstOrganizationOrNullMock.mockResolvedValue({ id: 'org-1' });

    const result = await loader({
      request: new Request('https://e-code.ai/import/spreadsheet', {
        headers: { 'accept-language': 'fr-FR,fr;q=0.9' },
      }),
    } as never);

    const data = readData<{ language: string }>(result);

    expect(data.language).toBe('fr');
    expect((result as { init?: { headers?: Headers } }).init?.headers?.get('Content-Language')).toBe('fr');
  });

  it('uses stable validation codes and hides an upstream project error', async () => {
    const missing = await action({ request: formRequest({ csv: '', name: '' }) } as never);

    firstOrganizationMock.mockResolvedValue({ id: 'org-1', slug: 'northwind' });
    apiRequestMock.mockRejectedValue(
      new Response(JSON.stringify({ error: 'Private storage endpoint failed.' }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const failed = await action({
      request: formRequest({ csv: 'name,role\nAda,Engineer', name: 'People' }),
    } as never);

    expect(readData<{ errorCode: string }>(missing).errorCode).toBe('dataRequired');
    expect(readData<{ errorCode: string }>(failed).errorCode).toBe('createFailed');
    expect(JSON.stringify(readData(failed))).not.toContain('Private storage endpoint');
  });

  it('emits French SEO, Open Graph, canonical and hreflang metadata', () => {
    const tags = meta({ data: { language: 'fr' }, matches: [] } as never);

    expect(tags).toContainEqual({ title: 'Importer une feuille de calcul - E-Code' });
    expect(tags).toContainEqual({ property: 'og:locale', content: 'fr_FR' });
    expect(tags).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: 'https://e-code.ai/import/spreadsheet?lang=fr',
    });
    expect(tags).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://e-code.ai/import/spreadsheet',
    });
  });
});
