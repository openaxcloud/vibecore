/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DatabaseWorkbench } from './DatabaseWorkbench';

/*
 * RP-DB-10 — la carte « Stockage » de l'onglet Paramètres.
 *
 * Replit y écrit « 137.83MB of 20GB ». Nous avons désormais l'OCCUPATION
 * réelle — l'API la mesure avec `pg_database_size` et la rend avec le schéma —
 * mais la vue lisait `usedBytes` sur la LISTE DES CONNEXIONS, qui n'en porte
 * pas : la carte restait vide alors que la donnée existait.
 *
 * Ce test tient le CÂBLAGE, pas la fonction : il monte le vrai composant et
 * regarde ce que l'onglet Paramètres reçoit. La contre-épreuve est faite —
 * en retirant le repli sur la taille du schéma, il rougit.
 *
 * Le quota, lui, reste ABSENT : nous ne le mesurons nulle part, et « of 20GB »
 * serait un chiffre inventé.
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

/* Le double rend la prop : c'est elle qu'on mesure. */
vi.mock('./DatabaseSettings', () => ({
  DatabaseSettings: ({ storageUsedBytes }: { storageUsedBytes?: number }) => (
    <div data-testid="reglages">
      {typeof storageUsedBytes === 'number' ? `octets:${storageUsedBytes}` : 'sans taille'}
    </div>
  ),
}));

vi.mock('./DatabaseStudio', () => ({ DatabaseStudio: () => <div /> }));

const makeFetcher = (data?: unknown): Fetcher => ({ state: 'idle', data, load: vi.fn(), submit: vi.fn() });

/*
 * Ordre RÉEL des `useFetcher()` du panneau : connexions, provisionnement,
 * schéma. Le double les rend dans cet ordre — un décalage ferait lire la
 * charge utile du schéma comme une liste de connexions, et le panneau
 * afficherait l'état vide.
 */
const CONNEXIONS = {
  connections: [
    {
      key: 'DATABASE_URL',
      source: 'secret',
      kind: 'postgres',
      maskedUrl: 'postgresql://***@x/app',
      environment: 'development',
    },
  ],
  environments: ['development', 'production'],
};

/* Ce que rend réellement `GET /databases/schema` depuis le 08/09. */
const SCHEMA = { schema: { tables: [], databaseSizeBytes: 55606295 } };

afterEach(() => {
  cleanup();
  fetcherCall = 0;
});

describe('carte Stockage', () => {
  it('reçoit la taille MESURÉE par l’API, même si la liste des connexions n’en porte pas', () => {
    fetchers = [makeFetcher(CONNEXIONS), makeFetcher(), makeFetcher(SCHEMA)];

    render(<DatabaseWorkbench projectId="project-1" />);

    // Ouvrir la base, puis l'onglet Paramètres — le vrai chemin.
    fireEvent.click(screen.getByText('Base de développement'));
    fireEvent.click(screen.getByText(/Paramètres|Settings/u));

    expect(screen.getByTestId('reglages').textContent).toBe('octets:55606295');
  });

  it('et n’invente rien quand l’API ne mesure pas', () => {
    fetchers = [makeFetcher(CONNEXIONS), makeFetcher(), makeFetcher({ schema: { tables: [] } })];

    render(<DatabaseWorkbench projectId="project-1" />);
    fireEvent.click(screen.getByText('Base de développement'));
    fireEvent.click(screen.getByText(/Paramètres|Settings/u));

    expect(screen.getByTestId('reglages').textContent).toBe('sans taille');
  });
});
