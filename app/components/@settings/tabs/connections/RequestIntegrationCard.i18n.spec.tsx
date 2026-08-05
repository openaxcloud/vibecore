/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import RequestIntegrationCard from './RequestIntegrationCard';
import {
  formatConnectionsTabRequestDate,
  formatConnectionsTabRequestHeading,
  getConnectionsTabRequestSafeError,
  getConnectionsTabRequestStatusLabel,
} from '~/lib/i18n/catalogs/connections-tab';

let language = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

function responseWith(payload: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(payload),
  } as Response;
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: 'request-1',
    integrationName: 'English user integration name',
    useCaseDescription: 'English user-authored use case',
    status: 'pending',
    organizationId: null,
    createdAt: '2026-08-05T12:34:00.000Z',
    mine: false,
    ...overrides,
  };
}

describe('RequestIntegrationCard i18n surface', () => {
  beforeEach(() => {
    language = 'en';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders an explicit French loading state and localized form controls', () => {
    language = 'fr';
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>(() => undefined));

    const { container } = render(<RequestIntegrationCard />);

    expect(screen.getByRole('heading', { name: 'Demander une intégration' })).toBeTruthy();
    expect(screen.getByLabelText('Nom de l’intégration').getAttribute('placeholder')).toBe(
      'p. ex. Notion, Stripe ou Twilio',
    );
    expect(screen.getByLabelText('À quoi vous servirait-elle ?').getAttribute('placeholder')).toContain('cas d’usage');
    expect(screen.getByText('Chargement de vos demandes…')).toBeTruthy();
    expect(screen.getByText('Chargement de vos demandes…').parentElement?.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(2);
  });

  it('localizes dates, status, team marker, and plurals while preserving user content', async () => {
    language = 'fr';
    vi.mocked(fetch).mockResolvedValueOnce(
      responseWith({
        requests: [
          request(),
          request({ id: 'request-2', integrationName: 'Custom API', status: 'new_backend_status', mine: true }),
        ],
      }),
    );

    render(<RequestIntegrationCard />);

    await waitFor(() => expect(screen.getByText('Vos demandes (2)')).toBeTruthy());
    expect(screen.getByText('English user integration name')).toBeTruthy();
    expect(screen.getAllByText('English user-authored use case')).toHaveLength(2);
    expect(screen.getByText('(équipe)')).toBeTruthy();
    expect(screen.getByText('En attente')).toBeTruthy();
    expect(screen.getByText('État inconnu')).toBeTruthy();
    expect(screen.getAllByText(/5 août 2026/u)).toHaveLength(2);
  });

  it('masks a failed load, updates with the live locale, and retries', async () => {
    language = 'fr';
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('Raw English upstream error secret=integration-private'))
      .mockResolvedValueOnce(responseWith({ requests: [] }));

    const { rerender } = render(<RequestIntegrationCard />);

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Impossible de charger'));
    expect(document.body.textContent).not.toContain('integration-private');

    language = 'en';
    rerender(<RequestIntegrationCard />);
    expect(screen.getByRole('alert').textContent).toContain('Integration requests could not be loaded');

    language = 'fr';
    rerender(<RequestIntegrationCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => expect(screen.getByText('Vous n’avez encore demandé aucune intégration.')).toBeTruthy());
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed list payloads without exposing their contents', async () => {
    language = 'fr';
    vi.mocked(fetch).mockResolvedValueOnce(
      responseWith({ requests: [{ id: 'secret=malformed-private', status: 'Raw English status' }] }),
    );

    render(<RequestIntegrationCard />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('temporairement indisponibles');
    expect(document.body.textContent).not.toContain('malformed-private');
    expect(document.body.textContent).not.toContain('Raw English status');
  });

  it('submits a real request and renders the localized success state', async () => {
    language = 'fr';
    vi.mocked(fetch)
      .mockResolvedValueOnce(responseWith({ requests: [] }))
      .mockResolvedValueOnce(
        responseWith({
          request: request({ integrationName: 'Notion', useCaseDescription: 'Synchroniser les documents', mine: true }),
        }),
      );

    render(<RequestIntegrationCard />);
    await waitFor(() => expect(screen.getByText('Vous n’avez encore demandé aucune intégration.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Nom de l’intégration'), { target: { value: 'Notion' } });
    fireEvent.change(screen.getByLabelText('À quoi vous servirait-elle ?'), {
      target: { value: 'Synchroniser les documents' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

    await waitFor(() => expect(screen.getByText('Merci ! Votre demande a bien été enregistrée.')).toBeTruthy());
    expect(screen.getByText('Votre demande (1)')).toBeTruthy();
    expect(screen.getByText('Notion')).toBeTruthy();

    const [, options] = vi.mocked(fetch).mock.calls[1];
    const form = options?.body as FormData;

    expect(options?.method).toBe('POST');
    expect(form.get('integrationName')).toBe('Notion');
    expect(form.get('useCaseDescription')).toBe('Synchroniser les documents');
  });

  it('never renders a raw submit error returned by the API', async () => {
    language = 'fr';
    vi.mocked(fetch)
      .mockResolvedValueOnce(responseWith({ requests: [] }))
      .mockResolvedValueOnce(responseWith({ error: 'Raw English secret=submit-private' }, false));

    render(<RequestIntegrationCard />);
    await waitFor(() => expect(screen.getByText('Vous n’avez encore demandé aucune intégration.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Nom de l’intégration'), { target: { value: 'Twilio' } });
    fireEvent.change(screen.getByLabelText('À quoi vous servirait-elle ?'), {
      target: { value: 'Envoyer des notifications' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Impossible d’envoyer'));
    expect(document.body.textContent).not.toContain('submit-private');
    expect(document.body.textContent).not.toContain('Raw English');
  });

  it('formats helpers safely and falls back to English', () => {
    expect(formatConnectionsTabRequestHeading(0, 'fr')).toBe('Vos demandes (0)');
    expect(formatConnectionsTabRequestHeading(1, 'fr')).toBe('Votre demande (1)');
    expect(formatConnectionsTabRequestHeading(1_200, 'fr')).toMatch(/^Vos demandes \(1[\s\u202f]200\)$/u);
    expect(formatConnectionsTabRequestDate('2026-08-05T12:34:00.000Z', 'fr')).toMatch(/5 août 2026/u);
    expect(formatConnectionsTabRequestDate('not-a-date', 'fr')).toBe('');
    expect(getConnectionsTabRequestStatusLabel('in-progress', 'fr')).toBe('En cours');
    expect(getConnectionsTabRequestStatusLabel('untrusted English status', 'fr')).toBe('État inconnu');
    expect(getConnectionsTabRequestStatusLabel('pending', 'de-DE')).toBe('Pending');
    expect(getConnectionsTabRequestSafeError('submit', 'fr', new Error('secret=private'))).not.toContain('private');
  });

  it('aborts the in-flight list request on unmount', () => {
    let signal: AbortSignal | undefined;

    vi.mocked(fetch).mockImplementationOnce((_input, init) => {
      signal = init?.signal ?? undefined;

      return new Promise<Response>(() => undefined);
    });

    const { unmount } = render(<RequestIntegrationCard />);

    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('has zero scanner findings and explicit responsive, theme, accessibility, and safety safeguards', async () => {
    const sourcePath = 'app/components/@settings/tabs/connections/RequestIntegrationCard.tsx';
    const source = readFileSync(sourcePath, 'utf8');
    const { scanSource } = await import('../../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, sourcePath);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).toContain('sm:flex-row');
    expect(source).toContain('min-h-11');
    expect(source).toContain('break-words');
    expect(source).toContain('status-error');
    expect(source).toContain('status-success');
    expect(source).toContain('aria-labelledby');
    expect(source).toContain('role="alert"');
    expect(source).toContain('AbortController');
    expect(source).not.toContain('data.error');
    expect(source).not.toContain('error.message');
  });
});
