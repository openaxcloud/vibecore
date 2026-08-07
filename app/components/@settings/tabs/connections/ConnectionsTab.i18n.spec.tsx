/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ConnectionsTab from './ConnectionsTab';
import {
  connectionsTabEn,
  connectionsTabFr,
  formatConnectionsTabNumber,
  formatConnectionsTabProviderSummary,
  getConnectionsTabCopy,
  getConnectionsTabSafeError,
  interpolateConnectionsTabCopy,
} from '~/lib/i18n/catalogs/connections-tab';

let language = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

vi.mock('react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { children?: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('./RequestIntegrationCard', () => ({
  default: () => <div data-testid="request-integration-card" />,
}));

function responseWith(payload: unknown, options: { ok?: boolean; statusText?: string } = {}): Response {
  return {
    ok: options.ok ?? true,
    statusText: options.statusText ?? 'OK',
    json: () => Promise.resolve(payload),
  } as Response;
}

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

describe('ConnectionsTab i18n surface', () => {
  beforeEach(() => {
    language = 'en';
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(responseWith({ providers: [] }))),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps flat EN/FR and interpolation parity with an English fallback', () => {
    const intentionallySharedKeys = new Set<keyof typeof connectionsTabEn>([
      'connectionsTab.service.github',
      'connectionsTab.service.gitlab',
      'connectionsTab.service.netlify',
      'connectionsTab.service.vercel',
      'connectionsTab.service.supabase',
    ]);

    expect(Object.keys(connectionsTabFr)).toEqual(Object.keys(connectionsTabEn));

    for (const key of Object.keys(connectionsTabEn) as (keyof typeof connectionsTabEn)[]) {
      expect(connectionsTabEn[key].trim().length, key).toBeGreaterThan(0);
      expect(connectionsTabFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(connectionsTabFr[key]), key).toEqual(interpolationTokens(connectionsTabEn[key]));

      if (!intentionallySharedKeys.has(key)) {
        expect(connectionsTabFr[key], key).not.toBe(connectionsTabEn[key]);
      }
    }

    expect(getConnectionsTabCopy('de-DE')['connectionsTab.providers.title']).toBe('Provider Keys');
    expect(getConnectionsTabSafeError('fr', new Error('secret=provider-private'))).toContain(
      'temporairement indisponibles',
    );
    expect(
      interpolateConnectionsTabCopy(connectionsTabFr['connectionsTab.provider.status'], {
        provider: 'Provider_English_ID',
        status: 'Configuré',
      }),
    ).toContain('Provider_English_ID');
  });

  it('formats French counts and provider-summary plurals', () => {
    expect(formatConnectionsTabNumber(12_345, 'fr')).toMatch(/^12[\s\u202f]345$/u);
    expect(formatConnectionsTabProviderSummary(1, 1, 'fr')).toBe('1/1 fournisseur configuré');
    expect(formatConnectionsTabProviderSummary(1_200, 5_000, 'fr')).toMatch(
      /^1[\s\u202f]200\/5[\s\u202f]000 fournisseurs configurés$/u,
    );
  });

  it('renders an explicit French loading state and skeleton', () => {
    language = 'fr';
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(() => undefined));

    const { container } = render(<ConnectionsTab />);

    expect(screen.getByText('Clés des fournisseurs')).toBeTruthy();
    expect(screen.getByText('Vérification des fournisseurs configurés…')).toBeTruthy();
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(4);
  });

  it('localizes configured status and links while preserving provider names and routes', async () => {
    language = 'fr';
    vi.mocked(fetch).mockResolvedValueOnce(
      responseWith({
        providers: [
          { name: 'OpenAI English Provider', isConfigured: true, configMethod: 'environment' },
          { name: 'CustomProviderV2', isConfigured: false, configMethod: 'none' },
        ],
      }),
    );

    render(<ConnectionsTab />);

    await waitFor(() => expect(screen.getByText('1/2 fournisseurs configurés')).toBeTruthy());
    expect(screen.getByText('OpenAI English Provider')).toBeTruthy();
    expect(screen.getByText('CustomProviderV2')).toBeTruthy();
    expect(screen.getByText('Configuré').getAttribute('aria-label')).toBe('OpenAI English Provider : Configuré');
    expect(screen.getByText('Non configuré').getAttribute('aria-label')).toBe('CustomProviderV2 : Non configuré');

    expect(screen.getByRole('link', { name: 'Ouvrir les fournisseurs' }).getAttribute('href')).toBe(
      '/settings/providers',
    );
    expect(screen.getByRole('link', { name: 'Ouvrir les paramètres de GitHub' }).getAttribute('href')).toBe(
      '/settings/github',
    );
    expect(screen.getByRole('link', { name: 'Ouvrir les paramètres de Fournisseurs cloud' }).getAttribute('href')).toBe(
      '/settings/providers',
    );
    expect(screen.getByRole('link', { name: 'Ouvrir les paramètres de Serveurs MCP' }).getAttribute('href')).toBe(
      '/settings/mcp',
    );
    expect(screen.getByTestId('request-integration-card')).toBeTruthy();
  });

  it('renders a localized empty state for a valid empty response', async () => {
    language = 'fr';

    render(<ConnectionsTab />);

    await waitFor(() => expect(screen.getByText('Aucun fournisseur disponible')).toBeTruthy());
    expect(screen.getByText(/Aucun fournisseur configurable/u)).toBeTruthy();
    expect(screen.getByText('0/0 fournisseurs configurés')).toBeTruthy();
  });

  it('masks provider failures, updates the live locale, and retries safely', async () => {
    language = 'fr';
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('Raw upstream English error secret=provider-private'))
      .mockResolvedValueOnce(
        responseWith({
          providers: [{ name: 'RecoveredProvider', isConfigured: true, configMethod: 'environment' }],
        }),
      );

    const { rerender } = render(<ConnectionsTab />);

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Impossible de charger les clés'));
    expect(screen.getByRole('alert').textContent).toContain('temporairement indisponibles');
    expect(document.body.textContent).not.toContain('provider-private');

    language = 'en';
    rerender(<ConnectionsTab />);
    expect(screen.getByRole('alert').textContent).toContain('Provider keys could not be loaded');

    language = 'fr';
    rerender(<ConnectionsTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => expect(screen.getByText('1/1 fournisseur configuré')).toBeTruthy());
    expect(screen.getByText('RecoveredProvider')).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('treats malformed provider payloads as a safe localized error', async () => {
    language = 'fr';
    vi.mocked(fetch).mockResolvedValueOnce(responseWith({ providers: [{ name: 'Missing fields' }] }));

    render(<ConnectionsTab />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('Impossible de charger les clés des fournisseurs');
    expect(document.body.textContent).not.toContain('Invalid configured provider record');
  });

  it('aborts the in-flight provider request on unmount', () => {
    let signal: AbortSignal | undefined;

    vi.mocked(fetch).mockImplementationOnce((_input, init) => {
      signal = init?.signal ?? undefined;

      return new Promise(() => undefined);
    });

    const { unmount } = render(<ConnectionsTab />);

    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('has zero scanner findings and explicit responsive, theme, accessibility, and safety safeguards', async () => {
    const sourcePath = 'app/components/@settings/tabs/connections/ConnectionsTab.tsx';
    const source = readFileSync(sourcePath, 'utf8');
    const { scanSource } = await import('../../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, sourcePath);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).toContain('sm:flex-row');
    expect(source).toContain('min-[360px]:flex-row');
    expect(source).toContain('md:grid-cols-2');
    expect(source).toContain('min-h-11');
    expect(source).toContain('dark:');
    expect(source).toContain('aria-labelledby');
    expect(source).toContain('role="alert"');
    expect(source).toContain('AbortController');
    expect(source).not.toContain('setError(');
    expect(source).not.toContain('error.message');
    expect(source).toContain('provider.name');
    expect(source).toContain('to={service.href}');
  });
});
