/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DatabaseWorkbench } from './DatabaseWorkbench';

/*
 * RP-DB-07 — SECOND MÉCANISME de la note dev/prod.
 *
 * `note-dev-prod.spec.ts` tient la RÈGLE (quand la note a un sens). Il ne dit
 * rien du panneau : on peut avoir une règle juste et ne l'appeler nulle part —
 * c'est exactement ce qui était arrivé à la carte « Stockage », dont la donnée
 * existait et n'atteignait pas la vue. Ce test monte donc le vrai panneau.
 */

type Fetcher = { state: 'idle'; data?: unknown; load: ReturnType<typeof vi.fn>; submit: ReturnType<typeof vi.fn> };

let fetchers: Fetcher[] = [];
let fetcherCall = 0;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'fr', resolvedLanguage: 'fr' } }),
}));

vi.mock('react-router', () => ({
  useFetcher: () => {
    const fetcher = fetchers[fetcherCall % fetchers.length];
    fetcherCall += 1;

    return fetcher;
  },
}));

vi.mock('./DatabaseSettings', () => ({ DatabaseSettings: () => <div /> }));
vi.mock('./DatabaseStudio', () => ({ DatabaseStudio: () => <div /> }));

const makeFetcher = (data?: unknown): Fetcher => ({ state: 'idle', data, load: vi.fn(), submit: vi.fn() });

const connexion = (key: string, environment: string) => ({
  key,
  source: 'secret',
  kind: 'postgres',
  maskedUrl: `postgresql://***@x/${key}`,
  environment,
});

const DEUX_BASES = {
  connections: [connexion('DATABASE_URL', 'development'), connexion('PROD_DATABASE_URL', 'production')],
  environments: ['development', 'production'],
};

const UNE_BASE = { connections: [connexion('DATABASE_URL', 'development')], environments: ['development'] };

afterEach(() => {
  cleanup();
  fetcherCall = 0;
  window.localStorage.clear();
});

describe('note dev/prod dans le panneau', () => {
  it('s’affiche quand le projet a DEUX bases, et disparaît sur « J’ai compris »', () => {
    fetchers = [makeFetcher(DEUX_BASES), makeFetcher(), makeFetcher()];

    render(<DatabaseWorkbench projectId="projet-note-1" />);

    expect(screen.getByTestId('db-note-dev-prod')).toBeTruthy();

    fireEvent.click(screen.getByTestId('db-note-compris'));

    expect(screen.queryByTestId('db-note-dev-prod')).toBeNull();
  });

  it('et ne revient pas au remontage — le rejet est rangé', () => {
    fetchers = [makeFetcher(DEUX_BASES), makeFetcher(), makeFetcher()];

    const premier = render(<DatabaseWorkbench projectId="projet-note-2" />);
    fireEvent.click(screen.getByTestId('db-note-compris'));
    premier.unmount();
    fetcherCall = 0;

    fetchers = [makeFetcher(DEUX_BASES), makeFetcher(), makeFetcher()];
    render(<DatabaseWorkbench projectId="projet-note-2" />);

    expect(screen.queryByTestId('db-note-dev-prod')).toBeNull();
  });

  it('ne s’affiche PAS sur un projet qui n’a qu’une base', () => {
    fetchers = [makeFetcher(UNE_BASE), makeFetcher(), makeFetcher()];

    render(<DatabaseWorkbench projectId="projet-note-3" />);

    expect(screen.queryByTestId('db-note-dev-prod')).toBeNull();
  });
});
