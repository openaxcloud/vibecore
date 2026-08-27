/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from '@testing-library/react';
import type { FormEventHandler, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());

const routeState = vi.hoisted(() => ({
  actionData: undefined as unknown,
  loaderData: { organizations: [], language: 'en' } as unknown,
  navigationState: 'idle',
  searchParams: new URLSearchParams(),
}));

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/enterprise-api.server')>();

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequestMock(...args),
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
    useRouteError: () => ({ errorCode: 'loadFailed' }),
    useSearchParams: () => [routeState.searchParams, vi.fn()],
  };
});

vi.mock('@radix-ui/react-dialog', () => ({
  Root: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  AppShell: ({
    title,
    description,
    actions,
    children,
  }: {
    title: string;
    description: string;
    actions?: ReactNode;
    children: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {actions}
      {children}
    </main>
  ),
  ActivityList: ({ items }: { items: Array<{ title: string; detail: string }> }) => (
    <ul>
      {items.map((item) => (
        <li key={item.title}>
          <strong>{item.title}</strong>
          <span>{item.detail}</span>
        </li>
      ))}
    </ul>
  ),
  LinkButton: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

vi.mock('~/components/ui/Dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import OrganizationSwitcherPage, { action, loader, meta } from './organization-switcher';
import { createI18nInstance } from '~/lib/i18n/runtime';

function readData<T>(result: unknown): T {
  if (result && typeof result === 'object' && 'data' in result) {
    return (result as { data: T }).data;
  }

  return result as T;
}

function request(path = '/organization-switcher?lang=fr', init?: RequestInit) {
  return new Request(`https://e-code.ai${path}`, init);
}

afterEach(() => {
  cleanup();
  apiRequestMock.mockReset();
  routeState.actionData = undefined;
  routeState.loaderData = { organizations: [], language: 'en' };
  routeState.navigationState = 'idle';
  routeState.searchParams = new URLSearchParams();
});

describe('organization switcher i18n', () => {
  it('renders French copy and switches to English without changing organization names', async () => {
    routeState.loaderData = {
      organizations: [{ id: 'org-1', name: 'Northwind R&D' }],
      language: 'fr',
    };
    routeState.actionData = { ok: false, errorCode: 'nameRequired' };
    routeState.searchParams = new URLSearchParams('create=1');

    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <OrganizationSwitcherPage />
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Organisations' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nouvelle organisation' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Créer une organisation' })).toBeTruthy();
    expect(screen.getByLabelText('Nom')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('Saisissez un nom pour l’organisation.');
    expect(screen.getByText('Northwind R&D')).toBeTruthy();

    await act(async () => i18n.changeLanguage('en'));

    expect(screen.getByRole('heading', { name: 'Organizations' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New organization' })).toBeTruthy();
    expect(screen.getByText('Northwind R&D')).toBeTruthy();
  });

  it('resolves French on the server and never returns malformed organization rows', async () => {
    apiRequestMock.mockResolvedValue({
      organizations: [{ id: 'org-1', name: 'Northwind' }, null, { name: 'Missing id' }],
    });

    const result = await loader({ request: request() } as never);
    const data = readData<{ organizations: Array<{ id: string }>; language: string }>(result);

    expect(data.language).toBe('fr');
    expect(data.organizations).toEqual([{ id: 'org-1', name: 'Northwind' }]);
  });

  it('returns stable action codes and hides upstream errors', async () => {
    const missing = await action({
      request: request('/organization-switcher?lang=fr', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ name: '' }).toString(),
      }),
    } as never);

    apiRequestMock.mockRejectedValue(
      new Response(JSON.stringify({ error: 'Private database host failed.' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const failed = await action({
      request: request('/organization-switcher?lang=fr', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ name: 'Northwind' }).toString(),
      }),
    } as never);

    expect(readData<{ errorCode: string }>(missing).errorCode).toBe('nameRequired');
    expect(readData<{ errorCode: string }>(failed).errorCode).toBe('requestFailed');
    expect(JSON.stringify(readData(failed))).not.toContain('Private database host');
  });

  it('emits localized SEO, Open Graph, canonical and hreflang metadata', () => {
    const tags = meta({ data: { organizations: [], language: 'fr' }, matches: [] } as never);

    expect(tags).toContainEqual({ title: 'Organisations - E-Code' });
    expect(tags).toContainEqual({ property: 'og:locale', content: 'fr_FR' });
    expect(tags).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: 'https://e-code.ai/organization-switcher?lang=fr',
    });
    expect(tags).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://e-code.ai/organization-switcher',
    });
  });
});
