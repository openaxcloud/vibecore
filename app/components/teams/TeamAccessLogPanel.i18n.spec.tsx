/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const revalidateMock = vi.hoisted(() => vi.fn());
const localeState = vi.hoisted(() => ({ language: 'fr', revalidatorState: 'idle' }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: localeState.language, language: localeState.language },
    t: (key: string) => key,
  }),
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    useRevalidator: () => ({ state: localeState.revalidatorState, revalidate: revalidateMock }),
  };
});

import { TeamAccessLogPanel } from './TeamAccessLogPanel';
import {
  formatTeamAccessLogCount,
  formatTeamAccessLogDateTime,
  getTeamAccessLogCopy,
} from '~/lib/i18n/catalogs/team-access-log';
import type { TeamAccessLogData, TeamAccessLogRow } from '~/lib/team-access-log.server';

const rows: TeamAccessLogRow[] = [
  {
    createdAt: '2026-08-05T03:04:00.000Z',
    actorUserId: 'usr_customer_actor_123456789',
    action: 'member.invited',
    resourceType: 'membership',
    resourceId: 'membership_customer_owned_123456789',
    ipAddress: '2001:db8:85a3::8a2e:370:7334',
  },
  {
    createdAt: 'customer-entered-timestamp',
    actorUserId: 'service_account_customer_owned',
    action: 'project.access.granted',
    resourceType: 'project',
    resourceId: 'https://customer.example/projects/project-123?source=audit',
    ipAddress: '203.0.113.42',
  },
];

function panelData(overrides: Partial<TeamAccessLogData> = {}): TeamAccessLogData {
  return {
    teamId: 'team_customer_owned_123456789',
    basePath: '/teams/team_customer_owned_123456789',
    entries: rows,
    listError: false,
    forbidden: false,
    ...overrides,
  };
}

beforeEach(() => {
  localeState.language = 'fr';
  localeState.revalidatorState = 'idle';
  revalidateMock.mockReset();
});

afterEach(() => cleanup());

describe('TeamAccessLogPanel rendered i18n', () => {
  it('renders the complete French surface and preserves every technical audit value', () => {
    const { container } = render(<TeamAccessLogPanel {...panelData()} />);

    expect(
      screen.getByRole('region', { name: 'Journal des accès de l’équipe team_customer_owned_123456789' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Exportation' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Événements d’accès' })).toBeTruthy();
    expect(screen.getByLabelText('Action')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Toutes les actions' })).toBeTruthy();
    expect(screen.getByText('2 événements')).toBeTruthy();
    expect(screen.getAllByText(/5 août 2026.*03:04/u).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('customer-entered-timestamp').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('usr_customer_actor_123456789').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('member.invited').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText('membership · membership_customer_owned_123456789').length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getAllByText('project · https://customer.example/projects/project-123?source=audit').length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('2001:db8:85a3::8a2e:370:7334').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('team_customer_owned_123456789')).toBeTruthy();

    const csv = screen.getByTestId('team-access-log-export-csv');
    const json = screen.getByTestId('team-access-log-export-json');
    expect(csv.getAttribute('href')).toBe('/teams/team_customer_owned_123456789?export=csv');
    expect(json.getAttribute('href')).toBe('/teams/team_customer_owned_123456789?export=json');
    expect(csv.hasAttribute('download')).toBe(true);
    expect(container.textContent).not.toContain('Export CSV');
    expect(container.textContent).not.toContain('Access events');
    expect(container.textContent).not.toContain('All actions');
  });

  it('uses mobile/tablet cards, an intentional desktop table and wrap-safe 44px controls', () => {
    const { container } = render(<TeamAccessLogPanel {...panelData()} />);
    const table = screen.getByRole('table');
    const mobileList = container.querySelector('ul.lg\\:hidden');
    const filter = screen.getByTestId('team-access-log-action-filter');
    const actorValues = screen.getAllByText('usr_customer_actor_123456789');

    expect(table.parentElement?.className).toContain('hidden');
    expect(table.parentElement?.className).toContain('lg:block');
    expect(table.parentElement?.className).toContain('overflow-x-auto');
    expect(table.className).toContain('min-w-[');
    expect(mobileList).toBeTruthy();
    expect(mobileList?.className).toContain('lg:hidden');
    expect(filter.className).toContain('min-h-[44px]');
    expect(screen.getByTestId('team-access-log-export-csv').className).toContain('min-h-[44px]');
    expect(actorValues.some((element) => element.className.includes('break-all'))).toBe(true);
    expect(container.innerHTML).not.toContain('truncate');
  });

  it('filters by the preserved action and explains a stale filter with no matches', () => {
    const { rerender } = render(<TeamAccessLogPanel {...panelData()} />);
    const filter = screen.getByTestId('team-access-log-action-filter');

    fireEvent.change(filter, { target: { value: 'member.invited' } });

    expect(screen.getByText('1 événement')).toBeTruthy();
    expect(screen.getAllByText('project.access.granted').every((element) => element.tagName === 'OPTION')).toBe(true);

    rerender(<TeamAccessLogPanel {...panelData({ entries: [rows[1]!] })} />);

    expect(screen.getByText('Aucun événement d’accès correspondant')).toBeTruthy();
    expect(screen.getByText(/Choisissez une autre action ou affichez-les toutes/u)).toBeTruthy();
  });

  it('renders an explicit French empty state without inventing an action', () => {
    render(<TeamAccessLogPanel {...panelData({ entries: [] })} />);

    expect(screen.getByText('Aucun événement d’accès pour le moment')).toBeTruthy();
    expect(screen.getByText(/apparaîtront ici dès qu’un événement sera enregistré/u)).toBeTruthy();
    expect(screen.queryByTestId('team-access-log-action-filter')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('masks upstream error prose, provides a real retry and never presents an error as empty data', () => {
    const unsafeData = {
      ...panelData({ entries: [], listError: true }),
      upstreamError: 'Raw English upstream database failure',
    } as TeamAccessLogData;

    const { container } = render(<TeamAccessLogPanel {...unsafeData} />);

    expect(screen.getByRole('heading', { name: 'Journal des accès de l’équipe indisponible' })).toBeTruthy();
    expect(screen.getByText(/Aucune donnée d’audit n’a été modifiée/u)).toBeTruthy();
    expect(screen.queryByText('Aucun événement d’accès pour le moment')).toBeNull();
    expect(container.textContent).not.toContain('Raw English upstream database failure');

    fireEvent.click(screen.getByRole('button', { name: 'Recharger le journal des accès' }));
    expect(revalidateMock).toHaveBeenCalledOnce();
  });

  it('treats malformed upstream rows as a safe localized failure instead of partial audit data', () => {
    const malformedEntries = [
      rows[0],
      null,
      { action: { raw: 'Raw English object' } },
    ] as unknown as TeamAccessLogRow[];

    const { container } = render(<TeamAccessLogPanel {...panelData({ entries: malformedEntries })} />);

    expect(screen.getByRole('heading', { name: 'Journal des accès de l’équipe indisponible' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('Aucun événement d’accès pour le moment')).toBeNull();
    expect(container.textContent).not.toContain('Raw English object');
  });

  it('announces a localized skeleton while the route is revalidating', () => {
    localeState.revalidatorState = 'loading';

    render(<TeamAccessLogPanel {...panelData()} />);

    expect(screen.getByRole('status', { name: 'Chargement des événements d’accès de l’équipe' })).toBeTruthy();
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    expect((screen.getByTestId('team-access-log-action-filter') as HTMLSelectElement).disabled).toBe(true);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Événements d’accès')).toBeTruthy();
  });

  it('localizes restricted access, preserves the permission key and disables both exports', () => {
    render(<TeamAccessLogPanel {...panelData({ forbidden: true })} />);

    expect(screen.getByRole('heading', { name: 'Accès restreint' })).toBeTruthy();
    expect(screen.getByText(/audit:export/u)).toBeTruthy();
    expect(screen.getAllByText('member.invited').length).toBeGreaterThanOrEqual(3);

    const csv = screen.getByTestId('team-access-log-export-csv') as HTMLButtonElement;
    const json = screen.getByTestId('team-access-log-export-json') as HTMLButtonElement;
    expect(csv.tagName).toBe('BUTTON');
    expect(json.tagName).toBe('BUTTON');
    expect(csv.disabled).toBe(true);
    expect(json.disabled).toBe(true);
    expect(csv.getAttribute('href')).toBeNull();
    expect(json.getAttribute('href')).toBeNull();
  });

  it('keeps a complete English fallback for unsupported locales', () => {
    localeState.language = 'de-DE';

    render(<TeamAccessLogPanel {...panelData({ entries: [] })} />);

    expect(screen.getByRole('heading', { name: 'Export' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Access events' })).toBeTruthy();
    expect(screen.getByText('No access events yet')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Export CSV' })).toBeTruthy();
  });

  it('contains unexpected render failures behind a localized panel boundary', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const unsafeRow = {} as TeamAccessLogRow;
    Object.defineProperty(unsafeRow, 'action', {
      get() {
        throw new Error('Raw English render failure');
      },
    });

    const { container } = render(<TeamAccessLogPanel {...panelData({ entries: [unsafeRow] })} />);

    expect(screen.getByRole('heading', { name: 'Panneau du journal des accès indisponible' })).toBeTruthy();
    expect(screen.getByText(/Vos données d’audit sont inchangées/u)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recharger le panneau' }).className).toContain('min-h-[44px]');
    expect(container.textContent).not.toContain('Raw English render failure');
    consoleError.mockRestore();
  });
});

describe('team access log locale helpers', () => {
  it('keeps the EN and FR catalogs complete with English fallback', () => {
    expect(Object.keys(getTeamAccessLogCopy('fr')).sort()).toEqual(Object.keys(getTeamAccessLogCopy('en')).sort());
    expect(getTeamAccessLogCopy('es')['teamAccessLog.events.title']).toBe('Access events');
  });

  it('formats French dates and large counts while preserving invalid audit timestamps', () => {
    expect(formatTeamAccessLogDateTime('2026-08-05T03:04:00.000Z', 'fr')).toMatch(/5 août 2026.*03:04/u);
    expect(formatTeamAccessLogDateTime('customer-entered-timestamp', 'fr')).toBe('customer-entered-timestamp');
    expect(formatTeamAccessLogDateTime(undefined, 'fr')).toBe('—');
    expect(formatTeamAccessLogCount(12_345, 'fr')).toMatch(/12(?:\u00a0|\u202f)345 événements/u);
    expect(formatTeamAccessLogCount(1, 'en')).toBe('1 event');
  });
});
