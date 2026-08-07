/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ImportCredentialProviderPage, { loader as credentialLoader, meta as credentialMeta } from './import.$provider';
import ImportHubPage, { loader as importHubLoader, meta as importHubMeta } from './import._index';
import { formatImportHubCopy, getImportHubCopy, importHubEn, importHubFr } from '~/lib/i18n/catalogs/import-hub';

const mocks = vi.hoisted(() => ({
  loaderData: undefined as unknown,
  firstOrganization: vi.fn(),
  revalidate: vi.fn(),
  revalidatorState: 'idle' as 'idle' | 'loading',
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
    useLoaderData: () => mocks.loaderData,
    useRevalidator: () => ({ state: mocks.revalidatorState, revalidate: mocks.revalidate }),
  };
});

vi.mock('./dashboard-nav', () => ({
  isExternalDashboardLink: () => false,
}));

vi.mock('~/lib/enterprise-api.server', () => ({
  firstOrganizationOrNull: (...args: unknown[]) => mocks.firstOrganization(...args),
  redirect: (location: string) =>
    new Response(null, {
      status: 302,
      headers: { location },
    }),
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
  AsyncPanelError: ({
    title,
    description,
    retryLabel,
    onRetry,
  }: {
    title: string;
    description: string;
    retryLabel: string;
    onRetry: () => void;
  }) => (
    <section role="alert">
      <h2>{title}</h2>
      <p>{description}</p>
      <button type="button" onClick={onRetry}>
        {retryLabel}
      </button>
    </section>
  ),
}));

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/gu)].map((match) => match[1]).sort();
}

describe('import hub routes i18n', () => {
  beforeEach(() => {
    mocks.loaderData = undefined;
    mocks.firstOrganization.mockReset().mockResolvedValue({ id: 'organization-user-id' });
    mocks.revalidate.mockReset();
    mocks.revalidatorState = 'idle';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps strict flat catalog and interpolation parity with an English fallback', () => {
    expect(Object.keys(importHubFr).sort()).toEqual(Object.keys(importHubEn).sort());

    for (const key of Object.keys(importHubEn) as Array<keyof typeof importHubEn>) {
      expect(importHubEn[key].trim().length, key).toBeGreaterThan(0);
      expect(importHubFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(importHubFr[key]), key).toEqual(interpolationTokens(importHubEn[key]));
    }

    expect(getImportHubCopy('de-DE')['importHub.page.title']).toBe('Import a project');
    expect(formatImportHubCopy(getImportHubCopy('fr')['importHub.credential.title'], { label: 'Figma' })).toBe(
      'Importer depuis Figma',
    );
  });

  it('detects French in the authenticated loader and localizes metadata', async () => {
    const data = await importHubLoader({
      request: new Request('https://e-code.ai/import', {
        headers: { 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8' },
      }),
    } as never);

    expect(data).toEqual({ language: 'fr', loadError: false });
    expect(importHubMeta({ data } as never)).toContainEqual({ title: 'Importer un projet - E-Code' });
  });

  it('renders every French source while preserving brands and import destinations', () => {
    mocks.loaderData = { language: 'fr', loadError: false };
    render(<ImportHubPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Importer un projet' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Dépôts Git' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Exports d’agents et d’outils de création' })).toBeTruthy();
    expect(screen.getByText('Archive ZIP')).toBeTruthy();
    expect(screen.getByText('Feuille de calcul')).toBeTruthy();
    expect(screen.getByText('GitHub')).toBeTruthy();
    expect(screen.getByText('Bitbucket')).toBeTruthy();
    expect(screen.getAllByText('Connecter le jeton')).toHaveLength(2);
    expect(screen.queryByText('Previous Agent export')).toBeNull();
    expect(document.querySelector('[data-import-source="github"]')?.getAttribute('href')).toBe('/import-github');
    expect(document.querySelector('[data-import-source="bitbucket"]')?.getAttribute('href')).toBe(
      '/import-github?source=bitbucket',
    );
    expect(document.querySelector('[data-import-source="previous-agent-export"]')?.getAttribute('href')).toBe(
      '/import-zip?source=previous-agent-export',
    );

    const longTile = document.querySelector('[data-import-source="previous-agent-export"]');

    expect(longTile?.className).toContain('min-w-0');
    expect(longTile?.querySelector('.break-words')).toBeTruthy();
  });

  it('masks a remote organization failure and exposes a real localized retry', async () => {
    const rawError = 'GET /orgs failed: bearer vc_session_raw_secret';
    mocks.firstOrganization.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: rawError }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const data = await importHubLoader({
      request: new Request('https://e-code.ai/import?lang=fr'),
    } as never);

    expect(data).toEqual({ language: 'fr', loadError: true });
    expect(JSON.stringify(data)).not.toContain(rawError);

    mocks.loaderData = data;
    render(<ImportHubPage />);

    expect(screen.getByRole('alert').textContent).toContain('Sources d’import indisponibles');
    expect(screen.getByRole('alert').textContent).not.toContain(rawError);
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(mocks.revalidate).toHaveBeenCalledTimes(1);
  });

  it('preserves missing-organization and authentication redirects', async () => {
    mocks.firstOrganization.mockResolvedValueOnce(null);

    const missingOrganization = await importHubLoader({
      request: new Request('https://e-code.ai/import?lang=fr'),
    } as never);

    expect(missingOrganization).toBeInstanceOf(Response);
    expect((missingOrganization as Response).status).toBe(302);
    expect((missingOrganization as Response).headers.get('location')).toBe('/');

    const authenticationRedirect = new Response(null, {
      status: 302,
      headers: { location: '/login?returnTo=%2Fimport' },
    });
    mocks.firstOrganization.mockRejectedValueOnce(authenticationRedirect);

    await expect(importHubLoader({ request: new Request('https://e-code.ai/import?lang=fr') } as never)).rejects.toBe(
      authenticationRedirect,
    );
  });

  it('localizes the credential-gated provider page and keeps provider values intact', () => {
    const data = credentialLoader({
      params: { provider: 'figma' },
      request: new Request('https://e-code.ai/import/figma?lang=fr'),
    } as never);

    expect(data).toEqual({
      provider: 'figma',
      language: 'fr',
      label: 'Figma',
      requirement: 'un jeton d’accès personnel Figma et la clé du fichier de design à importer',
    });
    expect(credentialMeta({ data } as never)).toContainEqual({ title: 'Importer depuis Figma - E-Code' });

    mocks.loaderData = data;
    render(<ImportCredentialProviderPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Importer depuis Figma' })).toBeTruthy();
    expect(screen.getByText(/L’import depuis Figma nécessite un jeton d’accès personnel Figma/u)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Identifiants requis — connectez Figma');
    expect(screen.getByRole('link', { name: 'Revenir à toutes les sources d’import' }).getAttribute('href')).toBe(
      '/import',
    );

    const panel = screen.getByRole('status').parentElement;
    const backLink = screen.getByRole('link', { name: 'Revenir à toutes les sources d’import' });

    expect(panel?.className).toContain('overflow-x-hidden');
    expect(backLink.className).toContain('min-h-11');
    expect(backLink.className).toContain('break-words');
  });

  it('returns 404 for an unknown provider and falls back to English for unsupported locales', () => {
    expect(() =>
      credentialLoader({
        params: { provider: 'unknown-user-source' },
        request: new Request('https://e-code.ai/import/unknown-user-source?lang=fr'),
      } as never),
    ).toThrow(expect.objectContaining({ status: 404 }));

    const data = credentialLoader({
      params: { provider: 'claude' },
      request: new Request('https://e-code.ai/import/claude?lang=es'),
    } as never);

    expect(data.language).toBe('es');
    expect(data.label).toBe('Claude');
    expect(data.requirement).toBe('a connected Claude source for the design or artifact you want to import');
  });

  it('has zero targeted hardcoded-copy scanner findings', async () => {
    const { scanSource } = await import('../../scripts/i18n/source-scanner.mjs');

    for (const file of ['app/lib/import-hub.ts', 'app/routes/import._index.tsx', 'app/routes/import.$provider.tsx']) {
      const result = scanSource(readFileSync(file, 'utf8'), file);

      expect(result.parseErrors, file).toEqual([]);
      expect(result.findings, file).toEqual([]);
    }
  });
});
