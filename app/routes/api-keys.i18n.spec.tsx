/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FormEventHandler, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());
const routeState = vi.hoisted(() => ({ loaderData: undefined as unknown, actionData: undefined as unknown }));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    Form: ({
      children,
      className,
      noValidate,
      onSubmit,
    }: {
      children: ReactNode;
      className?: string;
      noValidate?: boolean;
      onSubmit?: FormEventHandler<HTMLFormElement>;
    }) => (
      <form className={className} noValidate={noValidate} onSubmit={onSubmit}>
        {children}
      </form>
    ),
    useActionData: () => routeState.actionData,
    useLoaderData: () => routeState.loaderData,
    useNavigation: () => ({ state: 'idle' }),
    useSubmit: () => vi.fn(),
  };
});

vi.mock('~/lib/enterprise-api.server', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  AppShell: ({ title, description, children }: { title: string; description: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </main>
  ),
  StatusPill: ({ label }: { label: string }) => <span>{label}</span>,
}));

vi.mock('~/components/ui/Dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <>{children}</>,
  ConfirmationDialog: ({
    isOpen,
    title,
    description,
    confirmLabel,
  }: {
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel: string;
  }) =>
    isOpen ? (
      <div role="alertdialog" aria-label={title}>
        <p>{description}</p>
        <button type="button">{confirmLabel}</button>
      </div>
    ) : null,
}));

import ApiKeysPage, { action, meta } from './api-keys';
import { getApiKeysCopy } from '~/lib/i18n/catalogs/api-keys-workspace-settings';
import { createI18nInstance } from '~/lib/i18n/runtime';

type TestApiKey = {
  id: string;
  name: string;
  keyPrefix: string | null;
  scopes: Array<'read' | 'write' | 'admin'>;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

function renderApiKeys(keys: TestApiKey[], language: 'en' | 'fr' = 'fr', actionData?: unknown) {
  routeState.loaderData = { keys, language };
  routeState.actionData = actionData;

  return render(
    <I18nextProvider i18n={createI18nInstance(language)}>
      <ApiKeysPage />
    </I18nextProvider>,
  );
}

async function runAction(fields: Record<string, string>) {
  const form = new URLSearchParams();

  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }

  const result = (await action({
    request: new Request('http://localhost/api-keys', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: form.toString(),
    }),
  } as never)) as {
    data: {
      ok: false;
      intent: 'create' | 'revoke' | 'unknown';
      errorCode: keyof ReturnType<typeof getApiKeysCopy>['errors'];
    };
    init?: { status?: number } | number | null;
  };

  const init = typeof result.init === 'number' ? { status: result.init } : result.init;

  return { body: result.data, status: init?.status ?? 200 };
}

afterEach(() => {
  cleanup();
  apiRequestMock.mockReset();
  vi.restoreAllMocks();
});

describe('API keys French surface', () => {
  it('localizes metadata, the empty state and the complete create dialog', async () => {
    const tags = meta({ data: { keys: [], language: 'fr' } } as never);

    expect(tags).toContainEqual({ title: 'Clés API — E-Code' });
    expect(tags).toContainEqual(
      expect.objectContaining({
        name: 'description',
        content: expect.stringContaining('accès programmatiques'),
      }),
    );

    renderApiKeys([]);

    expect(await screen.findByRole('heading', { level: 1, name: 'Clés API' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Clés actives' })).toBeTruthy();
    expect(screen.getByText('0 clé')).toBeTruthy();
    expect(screen.getByText('Aucune clé API')).toBeTruthy();
    expect(screen.queryByText('No API keys yet')).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: 'Créer une clé' })[0]!);

    expect(screen.getByRole('heading', { name: 'Créer une clé API' })).toBeTruthy();
    expect(screen.getByLabelText('Nom').getAttribute('placeholder')).toBe('Robot de déploiement CI');
    expect(screen.getByText('Lecture')).toBeTruthy();
    expect(screen.getByText('Écriture')).toBeTruthy();
    expect(screen.getByText('Administration')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Sans expiration' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '90 jours' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Créer la clé' })).toBeTruthy();
    expect(screen.getByRole('dialog').querySelector('form')?.noValidate).toBe(true);
  });

  it('renders create validation inside the open dialog in French', async () => {
    renderApiKeys([], 'fr', { ok: false, intent: 'create', errorCode: 'nameRequired' });

    fireEvent.click((await screen.findAllByRole('button', { name: 'Créer une clé' }))[0]!);

    expect(screen.getByRole('alert').textContent).toBe('Donnez un nom à la clé.');
    expect(screen.queryByText('Give the key a name.')).toBeNull();
  });

  it('localizes populated cards and tables while preserving user and technical data', async () => {
    renderApiKeys([
      {
        id: 'key_1',
        name: 'CI_RELEASER_01',
        keyPrefix: 'vck_live_1234',
        scopes: ['read', 'write'],
        lastUsedAt: null,
        expiresAt: '2026-12-31T00:00:00.000Z',
        createdAt: '2026-07-14T18:05:00.000Z',
      },
    ]);

    expect(await screen.findByText('1 clé')).toBeTruthy();
    expect(screen.getAllByText('CI_RELEASER_01')).toHaveLength(2);
    expect(screen.getAllByText('Lecture')).toHaveLength(2);
    expect(screen.getAllByText('Écriture')).toHaveLength(2);
    expect(screen.getAllByText('vck_live_1234…')).toHaveLength(2);
    expect(screen.getAllByText('Jamais')).toHaveLength(2);
    expect(screen.getByText('31 déc. 2026')).toBeTruthy();
    expect(screen.getByText('Expire le 31 déc. 2026')).toBeTruthy();
    expect(screen.queryByText('write')).toBeNull();
    expect(screen.getByRole('region', { name: 'Tableau des clés API' }).className).toContain('overflow-x-auto');

    fireEvent.click(screen.getAllByRole('button', { name: 'Révoquer' })[0]!);

    expect(screen.getByRole('alertdialog', { name: 'Révoquer la clé « CI_RELEASER_01 » ?' })).toBeTruthy();
    expect(screen.getByText('Cette action est irréversible.', { exact: false })).toBeTruthy();
  });

  it('never returns a raw API body for an inline French error', async () => {
    const rawTechnicalMessage = 'Forbidden: upstream policy VC_INTERNAL_42';

    apiRequestMock.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: rawTechnicalMessage }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await runAction({
      intent: 'create',
      name: 'CI_RELEASER_01',
      'scope.read': 'on',
      expiresInDays: '90',
    });

    expect(result.status).toBe(403);
    expect(result.body).toEqual({ ok: false, intent: 'create', errorCode: 'requestRejected' });
    expect(JSON.stringify(result.body)).not.toContain(rawTechnicalMessage);
    expect(getApiKeysCopy('fr').errors[result.body.errorCode]).toBe(
      'La requête a été refusée. Vérifiez vos autorisations, puis réessayez.',
    );
  });

  it('rejects a crafted expiration value with localized validation copy', async () => {
    const result = await runAction({
      intent: 'create',
      name: 'CI_RELEASER_01',
      'scope.read': 'on',
      expiresInDays: '999999',
    });

    expect(result).toEqual({
      status: 400,
      body: { ok: false, intent: 'create', errorCode: 'expiryInvalid' },
    });
    expect(getApiKeysCopy('fr').errors[result.body.errorCode]).toBe('Sélectionnez une durée d’expiration valide.');
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});
