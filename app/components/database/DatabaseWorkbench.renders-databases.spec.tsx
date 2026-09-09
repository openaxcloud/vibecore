/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseWorkbench } from './DatabaseWorkbench';

/**
 * SECOND MÉCANISME du correctif « le bouton Créer une base ne fait rien ».
 *
 * Le correctif en a deux :
 *   1. `readEnvironments` ne prend plus une liste de CHAÎNES pour des bases.
 *      Tenu par `DatabaseWorkbench.environments.spec.ts`.
 *   2. Le COMPOSANT s'en sert pour décider quoi afficher. NON tenu —
 *      contre-épreuve faite : en remplaçant l'appel par `[]`, les 61 tests du
 *      dossier restaient VERTS, alors que le panneau réaffichait l'état vide
 *      pour toujours, c'est-à-dire EXACTEMENT le bug corrigé.
 *
 * Un correctif à deux mécanismes exige un test par mécanisme. Celui-ci monte le
 * vrai composant sur la charge utile réelle de `GET /projects/:id/databases` et
 * vérifie ce qui s'affiche — pas ce que rend une fonction prise à part.
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

/** Charge utile réelle de l'API : les bases dans `connections`, les NOMS dans `environments`. */
const CHARGE_API = {
  connections: [
    {
      key: 'DATABASE_URL',
      source: 'secret',
      kind: 'postgres',
      maskedUrl: 'postgresql://***@db-cmsp.../app',
      environment: 'development',
    },
  ],
  environments: ['development', 'preview', 'staging', 'production', 'shared'],
};

describe('DatabaseWorkbench — ce que le panneau AFFICHE réellement', () => {
  afterEach(() => {
    cleanup();
    fetcherCall = 0;
  });

  it('affiche la base du projet au lieu de l’état vide', () => {
    fetchers = [makeFetcher(CHARGE_API), makeFetcher()];

    render(<DatabaseWorkbench projectId="project-1" />);

    expect(
      screen.queryByText('Aucune base de données pour le moment'),
      'l’état vide ne doit PAS s’afficher quand le projet a une base',
    ).toBeNull();

    /*
     * RP-DB-02 / RP-DB-08 — la carte porte désormais le nom de son
     * ENVIRONNEMENT, comme Replit (« Development Database »), et non plus le
     * nom de la variable. Ce test épinglait « DATABASE_URL » : il a fait son
     * travail en rougissant le jour où l'affichage a changé volontairement.
     * Son intention — la base s'affiche au lieu de l'état vide — est
     * inchangée ; seule l'étiquette attendue suit.
     */
    expect(screen.getByText('Base de développement')).toBeTruthy();
  });

  it('mais une base d’environnement INDÉTERMINÉ garde le nom de sa variable', () => {
    /*
     * La moitié qui protège l'honnêteté : une connexion collée par
     * l'utilisateur ressort en « shared », et là nous ne savons PAS de quelle
     * base il s'agit. On affiche donc la clé, pas une étiquette inventée.
     */
    fetchers = [
      makeFetcher({
        connections: [{ ...CHARGE_API.connections[0], environment: 'shared' }],
        environments: CHARGE_API.environments,
      }),
      makeFetcher(),
    ];

    render(<DatabaseWorkbench projectId="project-1" />);

    expect(screen.getByText('DATABASE_URL')).toBeTruthy();
    expect(screen.queryByText('Base de développement')).toBeNull();
  });

  it('affiche une base EN COURS de provisionnement au lieu de l’état vide', () => {
    /*
     * Second mécanisme, côté panneau. L'API renvoie l'instance dans `databases`
     * tant qu'elle n'est pas ACTIVE (elle n'a pas encore de secret, donc aucune
     * `connection`). Sans ce rendu, un projet dont la base est en création
     * afficherait « Aucune base de données pour le moment » — le symptôme que
     * l'utilisateur a signalé.
     */
    fetchers = [
      makeFetcher({
        connections: [],
        databases: [{ key: 'DATABASE_URL', name: 'development', status: 'PROVISIONING' }],
        environments: CHARGE_API.environments,
      }),
      makeFetcher(),
    ];

    render(<DatabaseWorkbench projectId="project-1" />);

    expect(
      screen.queryByText('Aucune base de données pour le moment'),
      'une base en cours de création n’est pas une absence de base',
    ).toBeNull();

    /* Ce que l'utilisateur doit lire à la place : la base, et son état. */
    expect(screen.getByText('development')).toBeTruthy();
    expect(screen.getByText('Création en cours')).toBeTruthy();
  });

  it('garde l’état vide honnête quand le projet n’a réellement aucune base', () => {
    /*
     * L'autre sens : le correctif ne doit pas inventer des bases à partir des
     * cinq noms d'environnement, sinon un projet vide afficherait cinq cartes.
     */
    fetchers = [makeFetcher({ connections: [], environments: CHARGE_API.environments }), makeFetcher()];

    render(<DatabaseWorkbench projectId="project-1" />);

    expect(screen.getByText('Aucune base de données pour le moment')).toBeTruthy();
    expect(screen.queryByText('development'), 'un nom d’environnement n’est pas une base').toBeNull();
  });
});
