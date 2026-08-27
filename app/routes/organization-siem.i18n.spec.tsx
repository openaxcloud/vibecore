/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import type { FormEventHandler, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());
const firstOrganizationMock = vi.hoisted(() => vi.fn());
const revalidateMock = vi.hoisted(() => vi.fn());
const submitMock = vi.hoisted(() => vi.fn());

const routeState = vi.hoisted(() => ({
  actionData: undefined as unknown,
  loaderData: undefined as unknown,
  navigationState: 'idle',
  revalidatorState: 'idle',
}));

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/enterprise-api.server')>();

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequestMock(...args),
    firstOrganizationOrNull: (...args: unknown[]) => firstOrganizationMock(...args),
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
      onSubmit?: FormEventHandler<HTMLFormElement>;
    }) => (
      <form className={className} onSubmit={onSubmit}>
        {children}
      </form>
    ),
    useActionData: () => routeState.actionData,
    useLoaderData: () => routeState.loaderData,
    useNavigation: () => ({ state: routeState.navigationState }),
    useRevalidator: () => ({ state: routeState.revalidatorState, revalidate: revalidateMock }),
    useSubmit: () => submitMock,
  };
});

vi.mock('~/components/enterprise/EnterpriseFormPage', () => ({
  EnterpriseFormPage: ({
    title,
    description,
    status,
    error,
    children,
  }: {
    title: string;
    description: string;
    status?: string;
    error?: string;
    children: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {status ? <p role="status">{status}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {children}
    </main>
  ),
  PrimaryButton: ({ children }: { children: ReactNode }) => <button type="submit">{children}</button>,
  SelectField: ({
    label,
    name,
    options,
  }: {
    label: string;
    name: string;
    options: Array<{ value: string; label: string }>;
  }) => (
    <label>
      {label}
      <select name={name}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  ),
  TextField: ({
    label,
    name,
    placeholder,
    type,
  }: {
    label: string;
    name: string;
    placeholder?: string;
    type?: string;
  }) => (
    <label>
      {label}
      <input name={name} placeholder={placeholder} type={type} />
    </label>
  ),
}));

vi.mock('~/components/dashboard/AsyncPanelState', () => ({
  AsyncPanelSkeleton: ({ label }: { label: string }) => <section aria-label={label} />,
  AsyncPanelError: ({ title, description, retryLabel }: { title: string; description: string; retryLabel: string }) => (
    <section role="alert">
      <h2>{title}</h2>
      <p>{description}</p>
      <button type="button">{retryLabel}</button>
    </section>
  ),
}));

vi.mock('~/components/ui/Dialog', () => ({
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
      <section role="dialog">
        <h2>{title}</h2>
        <p>{description}</p>
        <button type="button">{confirmLabel}</button>
      </section>
    ) : null,
}));

import OrganizationSiemPage, { action, loader, meta } from './organization-siem';
import { formatOrganizationSiemCopy, getOrganizationSiemCopy } from '~/lib/i18n/catalogs/organization-siem';

function renderPage(loaderData: unknown, actionData?: unknown) {
  routeState.loaderData = loaderData;
  routeState.actionData = actionData;
  routeState.navigationState = 'idle';
  routeState.revalidatorState = 'idle';

  return render(<OrganizationSiemPage />);
}

async function runAction(fields: Record<string, string>) {
  const response = (await action({
    request: new Request('https://e-code.ai/organization-siem?lang=fr', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    }),
    params: {},
    context: {},
  })) as { data: { status?: string; error?: string }; init?: { status?: number } };

  return response;
}

afterEach(() => {
  cleanup();
  apiRequestMock.mockReset();
  firstOrganizationMock.mockReset();
  revalidateMock.mockReset();
  submitMock.mockReset();
  routeState.actionData = undefined;
  routeState.loaderData = undefined;
});

describe('organization SIEM i18n', () => {
  it('falls back to English and interpolates technical HTTP status values', () => {
    const copy = getOrganizationSiemCopy('fr');

    expect(getOrganizationSiemCopy('de')['organizationSiem.form.save']).toBe('Save SIEM webhook');
    expect(formatOrganizationSiemCopy(copy['organizationSiem.success.test'], { status: 202 })).toBe(
      'Événement de test livré — votre endpoint a répondu avec le statut HTTP 202.',
    );
  });

  it('renders every empty-state control in French', () => {
    renderPage({
      orgId: 'org-1',
      webhooks: [],
      loadError: false,
      loadErrorKind: null,
      language: 'fr',
    });

    expect(screen.getByRole('heading', { name: 'Webhooks SIEM' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Ajouter un webhook' })).toBeTruthy();
    expect(screen.getByLabelText('URL du webhook')).toBeTruthy();
    expect(screen.getByLabelText('Secret de signature')).toBeTruthy();
    expect(screen.getByLabelText('État')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enregistrer le webhook SIEM' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Webhooks configurés' })).toBeTruthy();
    expect(screen.getByText(/Aucun webhook SIEM n’est encore configuré/u)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Consulter et exporter les journaux d’audit' }).getAttribute('href')).toBe(
      '/audit-logs',
    );
    expect(screen.queryByText('Add a webhook')).toBeNull();
  });

  it('localizes rows and dates while preserving webhook URLs', () => {
    const url = 'https://security.customer.example/siem-ingest';

    renderPage({
      orgId: 'org-1',
      webhooks: [
        {
          id: 'webhook-1',
          url,
          enabled: true,
          lastDeliveredAt: '2026-08-04T12:00:00.000Z',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      loadError: false,
      loadErrorKind: null,
      language: 'fr',
    });

    expect(screen.getByText(url)).toBeTruthy();
    expect(screen.getAllByText('Activé')).toHaveLength(2);
    expect(screen.getByText(/Dernière livraison le 4 août 2026/u)).toBeTruthy();
    expect(screen.getByRole('button', { name: `Envoyer un événement de test au webhook SIEM ${url}` })).toBeTruthy();
    expect(screen.getByRole('button', { name: `Supprimer le webhook SIEM ${url}` })).toBeTruthy();
  });

  it('renders recoverable loading failures in French without a false empty state', () => {
    renderPage({
      orgId: 'org-1',
      webhooks: [],
      loadError: true,
      loadErrorKind: 'temporary',
      language: 'fr',
    });

    expect(screen.getByRole('heading', { name: 'Impossible de charger les webhooks SIEM' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recharger les webhooks' })).toBeTruthy();
    expect(screen.queryByText(/Aucun webhook SIEM n’est encore configuré/u)).toBeNull();
  });

  it('returns localized validation and delivery results without exposing receiver messages', async () => {
    const missingSecret = await runAction({ intent: 'create', orgId: 'org-1', url: 'https://siem.example.test' });

    expect(missingSecret.data.error).toBe('Le secret de signature doit contenir au moins 16 caractères.');
    expect(missingSecret.init?.status).toBe(400);

    apiRequestMock.mockResolvedValueOnce({ delivered: true, status: 202, statusText: 'Accepted' });

    const delivered = await runAction({ intent: 'test', orgId: 'org-1', webhookId: 'webhook-1' });
    expect(delivered.data.status).toBe('Événement de test livré — votre endpoint a répondu avec le statut HTTP 202.');

    apiRequestMock.mockResolvedValueOnce({ delivered: false, status: 503, statusText: 'Service Unavailable' });

    const rejected = await runAction({ intent: 'test', orgId: 'org-1', webhookId: 'webhook-1' });
    expect(rejected.data.error).toBe(
      'L’événement de test a été signé et envoyé, mais votre endpoint a répondu avec le statut HTTP 503.',
    );
    expect(rejected.data.error).not.toContain('Service Unavailable');
  });

  it('detects French in the loader and exposes localized metadata', async () => {
    firstOrganizationMock.mockResolvedValue({ id: 'org-1' });
    apiRequestMock.mockResolvedValue({ webhooks: [] });

    const result = (await loader({
      request: new Request('https://e-code.ai/organization-siem', { headers: { 'Accept-Language': 'fr-FR' } }),
      params: {},
      context: {},
    })) as { data: { language: string; webhooks: unknown[] } };

    expect(result.data.language).toBe('fr');
    expect(result.data.webhooks).toEqual([]);
    expect(meta({ matches: [{ id: 'root', data: { language: 'fr' } }] } as never)).toEqual([
      { title: 'Webhooks SIEM - E-Code' },
    ]);
  });
});
