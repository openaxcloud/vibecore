/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SupportTicketsPanel, type AdminSupportTicket } from './SupportTicketsPanel';
import {
  adminSupportTicketActionFeedback,
  adminSupportTicketStatusLabel,
  adminSupportTicketsEn,
  adminSupportTicketsFr,
  formatAdminSupportTicketsDateTime,
  formatAdminSupportTicketsDueDelta,
  formatAdminSupportTicketsNumber,
  formatAdminSupportTicketsPlural,
  getAdminSupportTicketsCopy,
} from '~/lib/i18n/catalogs/admin-support-tickets';

const routerMocks = vi.hoisted(() => ({
  fetcherCall: 0,
  fetchers: [] as Array<{
    state: 'idle' | 'loading' | 'submitting';
    data?: { ok?: boolean; message?: string; error?: string };
    submit: ReturnType<typeof vi.fn>;
  }>,
  search: '',
  setSearchParams: vi.fn(),
  revalidate: vi.fn(),
  revalidatorState: 'idle' as 'idle' | 'loading',
}));

let language = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');

  return {
    ...actual,
    useFetcher: () => {
      if (routerMocks.fetchers.length === 0) {
        return { state: 'idle', data: undefined, submit: vi.fn() };
      }

      const fetcher = routerMocks.fetchers[routerMocks.fetcherCall % routerMocks.fetchers.length];
      routerMocks.fetcherCall += 1;

      return fetcher;
    },
    useRevalidator: () => ({ state: routerMocks.revalidatorState, revalidate: routerMocks.revalidate }),
    useSearchParams: () => [new URLSearchParams(routerMocks.search), routerMocks.setSearchParams],
  };
});

vi.mock('~/components/ui/RelativeTime', () => ({
  RelativeTime: ({ value, className }: { value: string | number | Date; className?: string }) => (
    <time dateTime={new Date(value).toISOString()} className={className}>
      relative time
    </time>
  ),
}));

const NOW = Date.parse('2026-08-05T12:00:00.000Z');

function ticket(overrides: Partial<AdminSupportTicket> = {}): AdminSupportTicket {
  return {
    id: 'ticket-1',
    organizationId: 'org-123',
    userId: 'user-456',
    subject: 'Production deployment blocked',
    status: 'OPEN',
    createdAt: '2026-08-05T11:00:00.000Z',
    firstResponseDueAt: '2026-08-05T12:30:00.000Z',
    planKey: 'pro',
    ...overrides,
  };
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    tickets: [ticket()],
    assignees: [{ id: 'admin-1', name: 'Ari Admin', email: 'ari@example.com' }],
    ...overrides,
  };
}

describe('admin support tickets EN/FR catalog', () => {
  it('keeps complete key and interpolation parity with English fallback', () => {
    expect(Object.keys(adminSupportTicketsFr).sort()).toEqual(Object.keys(adminSupportTicketsEn).sort());
    expect(getAdminSupportTicketsCopy('fr-CA')['adminSupportTickets.column.subject']).toBe('Objet');
    expect(getAdminSupportTicketsCopy('de-DE')['adminSupportTickets.column.subject']).toBe('Subject');
  });

  it('pluralizes, formats numbers, dates and SLA deltas for French', () => {
    const copy = getAdminSupportTicketsCopy('fr');

    expect(
      formatAdminSupportTicketsPlural(1, 'fr', {
        one: copy['adminSupportTickets.count_one'],
        other: copy['adminSupportTickets.count_other'],
      }),
    ).toBe('1 ticket d’assistance');
    expect(
      formatAdminSupportTicketsPlural(12_345, 'fr', {
        one: copy['adminSupportTickets.count_one'],
        other: copy['adminSupportTickets.count_other'],
      }),
    ).toBe('12 345 tickets d’assistance');
    expect(formatAdminSupportTicketsNumber(12_345, 'en')).toBe('12,345');
    expect(formatAdminSupportTicketsDueDelta(NOW + 30 * 60_000, NOW, 'fr')).toBe('dans 30 minutes');
    expect(formatAdminSupportTicketsDueDelta(NOW - 2 * 60 * 60_000, NOW, 'fr')).toBe('il y a 2 heures');
    expect(formatAdminSupportTicketsDateTime('invalid', 'fr')).toBe('Date indisponible');
    expect(formatAdminSupportTicketsDateTime(NOW, 'fr')).toContain('2026');
  });

  it('localizes stable status values without changing their API identifiers', () => {
    expect(adminSupportTicketStatusLabel('OPEN', 'fr')).toBe('Ouvert');
    expect(adminSupportTicketStatusLabel('PENDING', 'fr')).toBe('En attente');
    expect(adminSupportTicketStatusLabel('RESOLVED', 'fr')).toBe('Résolu');
    expect(adminSupportTicketStatusLabel('CLOSED', 'fr')).toBe('Fermé');
    expect(adminSupportTicketStatusLabel('CUSTOM_STATUS', 'fr')).toBe('Inconnu');
  });

  it('never exposes raw action errors or raw success messages', () => {
    const rawError = 'PrismaClientKnownRequestError: secret database details';
    const assignment = adminSupportTicketActionFeedback({ ok: false, error: rawError }, 'assignment', 'fr');

    const response = adminSupportTicketActionFeedback(
      { ok: true, message: 'internal status=RESOLVED request_id=private' },
      'response',
      'fr',
    );

    expect(assignment).toEqual({
      tone: 'error',
      message: 'Impossible de modifier l’attribution du ticket. Vérifiez vos droits, puis réessayez.',
    });
    expect(response).toEqual({
      tone: 'success',
      message: 'Réponse envoyée et état du ticket mis à jour.',
    });
    expect(JSON.stringify({ assignment, response })).not.toContain(rawError);
    expect(JSON.stringify({ assignment, response })).not.toContain('request_id');
  });
});

describe('SupportTicketsPanel localized states and interactions', () => {
  beforeEach(() => {
    language = 'fr';
    routerMocks.fetcherCall = 0;
    routerMocks.fetchers = [];
    routerMocks.search = '';
    routerMocks.revalidatorState = 'idle';
    routerMocks.setSearchParams.mockReset();
    routerMocks.revalidate.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders an explicit localized loading skeleton', () => {
    render(<SupportTicketsPanel payload={{}} loading />);

    expect(screen.getByRole('status', { name: 'Chargement des tickets d’assistance' }).getAttribute('aria-busy')).toBe(
      'true',
    );
  });

  it('renders a sanitized load error with a working retry action', () => {
    render(<SupportTicketsPanel payload={{ supportTicketsLoadError: true }} />);

    expect(screen.getByRole('alert').textContent).toContain('Impossible de charger les tickets d’assistance');
    expect(screen.getByRole('alert').textContent).not.toContain('ECONNREFUSED');

    fireEvent.click(screen.getByRole('button', { name: 'Recharger les tickets d’assistance' }));

    expect(routerMocks.revalidate).toHaveBeenCalledOnce();
  });

  it('renders an explicit localized empty state without an irrelevant password field', () => {
    render(<SupportTicketsPanel payload={{ tickets: [], assignees: [] }} />);

    expect(screen.getByRole('status').textContent).toContain('Aucun ticket d’assistance');
    expect(screen.queryByLabelText('Mot de passe administrateur')).toBeNull();
  });

  it('renders French table chrome, statuses, SLA formatting and accessible controls', () => {
    render(<SupportTicketsPanel payload={payload()} />);

    expect(screen.getByRole('status').textContent).toBe('1 ticket d’assistance');
    expect(screen.getByLabelText('Mot de passe administrateur')).toHaveProperty('placeholder', 'Votre mot de passe');
    expect(screen.getByRole('button', { name: 'Trier par Objet' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Trier par État' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Trier par Créé' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Trier par Échéance de première réponse' })).toBeTruthy();
    expect(screen.getByText('Ouvert')).toBeTruthy();
    expect(screen.getByText(/dans 30 minutes/u)).toBeTruthy();
    expect(screen.getByText(/SLA pro/u)).toBeTruthy();
    expect(screen.getByText(/organisation org-123/u)).toBeTruthy();
    expect(screen.getByText(/utilisateur user-456/u)).toBeTruthy();

    const assignee = screen.getByRole('combobox', { name: 'Responsable du ticket Production deployment blocked' });

    expect(assignee.hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('option', { name: 'Non attribué' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Répondre' }));

    expect(screen.getByLabelText('Nouvel état')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'En attente' }).getAttribute('value')).toBe('PENDING');
    expect(screen.getByPlaceholderText('Rédigez votre réponse au client…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Envoyer la réponse' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Saisissez d’abord votre mot de passe ci-dessus.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Mot de passe administrateur'), { target: { value: 'secure-password' } });
    fireEvent.change(screen.getByPlaceholderText('Rédigez votre réponse au client…'), {
      target: { value: 'Votre déploiement est de nouveau disponible.' },
    });

    expect(screen.getByRole('button', { name: 'Envoyer la réponse' }).hasAttribute('disabled')).toBe(false);
  });

  it('masks raw fetcher errors in the rendered panel', () => {
    const rawError = 'PostgreSQL connection string: postgres://secret@internal';

    routerMocks.fetchers = [
      { state: 'idle', data: { ok: false, error: rawError }, submit: vi.fn() },
      { state: 'idle', data: { ok: false, error: rawError }, submit: vi.fn() },
    ];

    render(<SupportTicketsPanel payload={payload()} />);

    expect(screen.getByRole('alert').textContent).toBe(
      'Impossible de modifier l’attribution du ticket. Vérifiez vos droits, puis réessayez.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Répondre' }));

    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(document.body.textContent).not.toContain(rawError);
    expect(document.body.textContent).not.toContain('postgres://');
  });
});

describe('SupportTicketsPanel source safeguards', () => {
  it('has zero scanner findings and explicit async, responsive and accessibility safeguards', async () => {
    const sourcePath = 'app/components/admin/SupportTicketsPanel.tsx';
    const source = readFileSync(sourcePath, 'utf8');
    const routeSource = readFileSync('app/routes/admin.$section.tsx', 'utf8');
    const { scanSource } = await import('../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, sourcePath);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).toContain('getAdminSupportTicketsCopy');
    expect(source).toContain('adminSupportTicketActionFeedback');
    expect(source).not.toContain('data.error ?? data.message');
    expect(source).toContain('role="status"');
    expect(source).toContain('role="alert"');
    expect(source).toContain('aria-live');
    expect(source).toContain('aria-busy');
    expect(source).toContain('aria-sort');
    expect(source).toContain('aria-controls');
    expect(source).toContain('min-w-0');
    expect(source).toContain('max-w-full');
    expect(source).toContain('overflow-x-auto');
    expect(source).toContain('break-words');
    expect(source).toContain('[overflow-wrap:anywhere]');
    expect(source).toContain('whitespace-normal');
    expect(source).toContain('min-h-11');
    expect(source).toContain('focus-visible:ring-2');
    expect(source).toContain('motion-reduce:animate-none');
    expect(source).toContain('status-error-border');
    expect(source).toContain('status-warning-border');
    expect(source).toContain('status-success-border');
    expect(source).not.toMatch(/#[0-9a-f]{3,8}/iu);
    expect(routeSource).toContain('supportTicketsLoadError: true');
    expect(routeSource).toContain("loading={navigation.state === 'loading'}");
  });
});
