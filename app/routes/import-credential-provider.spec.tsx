/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes, FormHTMLAttributes, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ImportCredentialProviderPage, { action } from './import.$provider';
import { createI18nInstance } from '~/lib/i18n/runtime';

const mocks = vi.hoisted(() => ({
  loaderData: undefined as unknown,
  actionData: undefined as unknown,
  navigationState: 'idle' as 'idle' | 'submitting',
  navigationFormData: undefined as FormData | undefined,
  apiRequest: vi.fn(),
  firstOrganization: vi.fn(),
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    Link: ({ to, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
    Form: ({ children, ...props }: FormHTMLAttributes<HTMLFormElement>) => <form {...props}>{children}</form>,
    useLoaderData: () => mocks.loaderData,
    useActionData: () => mocks.actionData,
    useNavigation: () => ({ state: mocks.navigationState, formData: mocks.navigationFormData }),
    useRevalidator: () => ({ state: 'idle', revalidate: vi.fn() }),
  };
});

vi.mock('~/lib/enterprise-api.server', () => ({
  apiRequest: (...args: unknown[]) => mocks.apiRequest(...args),
  firstOrganization: (...args: unknown[]) => mocks.firstOrganization(...args),
  firstOrganizationOrNull: (...args: unknown[]) => mocks.firstOrganization(...args),
  isApiResponse: (error: unknown, status?: number) =>
    error instanceof Response && (status === undefined || error.status === status),
  json: (data: unknown, init?: unknown) => ({ data, init }),
  redirect: (location: string) => new Response(null, { status: 302, headers: { location } }),
}));

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  AppShell: ({ title, description, children }: { title: string; description: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </main>
  ),
}));

vi.mock('~/components/dashboard/AsyncPanelState', () => ({
  AsyncPanelError: ({ title, description }: { title: string; description: string }) => (
    <section role="alert">
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  ),
}));

vi.mock('~/components/@settings/shared/connectors/ConnectorApiKeyConnectButton', () => ({
  ConnectorApiKeyConnectButton: ({ displayName }: { displayName: string }) => (
    <button type="button">Connect {displayName}</button>
  ),
}));

function readData<T>(result: unknown): T {
  return (result as { data: T }).data;
}

function actionRequest(provider: string, fields: Record<string, string>) {
  return action({
    params: { provider },
    request: new Request(`https://e-code.ai/import/${provider}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields),
    }),
  } as never);
}

function preview(provider: 'vercel' | 'figma' | 'claude' = 'figma') {
  return {
    importJobId: 'import-job-1',
    state: 'AWAITING_USER_ACTION',
    preview: {
      provider,
      title: provider === 'figma' ? 'Checkout design' : 'Imported source',
      sourceRef: 'source-ref',
      fileCount: 1,
      byteCount: 2048,
      facts: [{ key: provider === 'figma' ? 'pages' : 'framework', value: '2' }],
      warnings: [
        provider === 'figma'
          ? 'figmaDocumentSnapshot'
          : provider === 'vercel'
            ? 'vercelConfigurationOnly'
            : 'claudeExactSource',
      ],
      paths: [provider === 'figma' ? 'design/figma-document.json' : 'source.txt'],
    },
    findings: [{ path: 'design/figma-document.json', line: 12, kind: 'high-entropy', preview: 'abcd…xyz' }],
    requiresConsent: true,
  };
}

describe('credential import route action', () => {
  beforeEach(() => {
    mocks.apiRequest.mockReset();
    mocks.firstOrganization.mockReset().mockResolvedValue({ id: 'org-1', slug: 'acme' });
    mocks.loaderData = undefined;
    mocks.actionData = undefined;
    mocks.navigationState = 'idle';
    mocks.navigationFormData = undefined;
  });

  afterEach(() => {
    cleanup();
  });

  it('stages a provider source server-side and sends no credential through the import action', async () => {
    mocks.apiRequest.mockResolvedValueOnce({ import: preview('figma') });

    const result = await actionRequest('figma', {
      intent: 'stage',
      sourceRef: 'https://www.figma.com/design/FigmaKey_123/Checkout',
      idempotencyKey: 'attempt-1',
    });

    expect(readData(result)).toMatchObject({ stage: 'preview', importJobId: 'import-job-1' });
    expect(mocks.apiRequest).toHaveBeenCalledTimes(1);

    const [request, path, init] = mocks.apiRequest.mock.calls[0] as [Request, string, RequestInit];
    expect(request).toBeInstanceOf(Request);
    expect(path).toBe('/orgs/org-1/imports');
    expect(JSON.parse(String(init.body))).toEqual({
      provider: 'figma',
      sourceRef: 'https://www.figma.com/design/FigmaKey_123/Checkout',
      idempotencyKey: 'attempt-1',
      files: [],
    });
    expect(String(init.body)).not.toMatch(/apiKey|token|credential/iu);
  });

  it('maps a connection failure to stable copy and drops upstream diagnostics', async () => {
    const rawDiagnostic = 'private upstream account detail';
    mocks.apiRequest.mockRejectedValueOnce(
      new Response(JSON.stringify({ code: 'IMPORT_CONNECTOR_NOT_LINKED', error: rawDiagnostic }), {
        status: 424,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await actionRequest('vercel', {
      intent: 'stage',
      sourceRef: 'acme-web',
      idempotencyKey: 'attempt-2',
    });

    const data = readData<{ stage: string; errorCode: string }>(result);

    expect(data).toMatchObject({ stage: 'error', errorCode: 'notConnected' });
    expect(JSON.stringify(data)).not.toContain(rawDiagnostic);
  });

  it('commits every explicit finding decision and redirects only after a real project response', async () => {
    mocks.apiRequest.mockResolvedValueOnce({ project: { id: 'project-1', slug: 'checkout-design' } });

    const result = await actionRequest('figma', {
      intent: 'commit',
      importJobId: 'import-job-1',
      'consent:design/figma-document.json:12': 'redact',
    });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get('location')).toBe('/@acme/checkout-design');

    const [, path, init] = mocks.apiRequest.mock.calls[0] as [Request, string, RequestInit];
    expect(path).toBe('/orgs/org-1/imports/import-job-1/commit');
    expect(JSON.parse(String(init.body))).toEqual({ consent: { 'design/figma-document.json:12': 'redact' } });
  });

  it('keeps the review recoverable when cancellation fails', async () => {
    mocks.apiRequest
      .mockRejectedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce({ import: preview('figma') });

    const result = await actionRequest('figma', {
      intent: 'cancel',
      importJobId: 'import-job-1',
    });

    expect(readData(result)).toMatchObject({
      stage: 'preview',
      importJobId: 'import-job-1',
      errorCode: 'cancelFailed',
    });
    expect(mocks.apiRequest.mock.calls.map(([, path]) => path)).toEqual([
      '/orgs/org-1/imports/import-job-1/cancel',
      '/orgs/org-1/imports/import-job-1',
    ]);
  });
});

describe('credential import preview UI', () => {
  beforeEach(() => {
    mocks.loaderData = {
      provider: 'figma',
      language: 'fr',
      label: 'Figma',
      organizationId: 'org-1',
      organizationSlug: 'acme',
      connection: { id: 'connection-1', externalAccountLabel: 'Design team', status: 'active' },
      loadError: false,
      attemptId: 'attempt-1',
    };
    mocks.actionData = undefined;
    mocks.navigationState = 'idle';
    mocks.navigationFormData = undefined;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders retrieved facts, honest limitations, paths and required secret decisions responsively', () => {
    mocks.actionData = { stage: 'preview', ...preview('figma') };

    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <ImportCredentialProviderPage />
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { name: '3. Vérifier avant la création' })).toBeTruthy();
    expect(screen.getByText('Checkout design')).toBeTruthy();
    expect(screen.getByText('design/figma-document.json')).toBeTruthy();
    expect(screen.getByText(/document Figma JSON complet/u)).toBeTruthy();
    expect(screen.getByText(/ligne 12/u)).toBeTruthy();

    const decisions = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(decisions).toHaveLength(2);
    expect(decisions.every((input) => input.required)).toBe(true);
    expect(screen.getByRole('button', { name: 'Créer le projet vérifié' }).className).toContain('min-h-11');
    expect(document.querySelector('.sm\\:grid-cols-2')).toBeTruthy();
  });

  it('shows an explicit progress state while the provider source is being retrieved', () => {
    mocks.navigationState = 'submitting';
    mocks.navigationFormData = new FormData();
    mocks.navigationFormData.set('intent', 'stage');

    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <ImportCredentialProviderPage />
      </I18nextProvider>,
    );

    expect(screen.getByRole('button', { name: 'Récupération et validation…' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Récupération de la source du fournisseur' })).toBeTruthy();
  });
});
