import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  IDE_MEMORY_BUDGET_BYTES,
  listEntries,
  pruneToBudget,
  totalBytes,
  writeWithinBudget,
  type BudgetStorage,
} from './ide-memory-budget';

/*
 * BUG-IDE-MEMORY-001 — le `localStorage` saturé cassait la boucle de génération.
 *
 * Relevé en production : 64 entrées `vibecore.projectIdeMemory:*`, une par
 * projet, JAMAIS purgées, 10 Mo au total — la limite du navigateur — dont une de
 * 3,1 Mo. À saturation la moindre écriture lève `QuotaExceededError` ; l'exception
 * remontait dans la boucle de génération et la cassait : tâche « En cours » qui
 * grimpe sans fin, aucun fichier écrit, aucune erreur affichée. Prouvé en direct :
 * purge manuelle → 9,77 Mo libérés → blocage disparu.
 */

const PREFIX = 'vibecore.projectIdeMemory';

function fausseStorage(
  initial: Record<string, string> = {},
  options: { plafondOctets?: number } = {},
): BudgetStorage & {
  donnees: Record<string, string>;
} {
  const donnees = { ...initial };

  const octets = () =>
    Object.entries(donnees).reduce((somme, [cle, valeur]) => somme + (cle.length + valeur.length) * 2, 0);

  return {
    donnees,
    get length() {
      return Object.keys(donnees).length;
    },
    key(index) {
      return Object.keys(donnees)[index] ?? null;
    },
    getItem(cle) {
      return donnees[cle] ?? null;
    },
    setItem(cle, valeur) {
      const apres =
        octets() - (donnees[cle] ? (cle.length + donnees[cle].length) * 2 : 0) + (cle.length + valeur.length) * 2;

      if (options.plafondOctets !== undefined && apres > options.plafondOctets) {
        const erreur = new Error('QuotaExceededError');
        erreur.name = 'QuotaExceededError';
        throw erreur;
      }

      donnees[cle] = valeur;
    },
    removeItem(cle) {
      delete donnees[cle];
    },
  };
}

const entree = (date: string, remplissage = 100) => JSON.stringify({ updatedAt: date, blob: 'x'.repeat(remplissage) });

describe('inventaire du stockage', () => {
  it('ne compte QUE les entrées de mémoire IDE', () => {
    const storage = fausseStorage({
      [`${PREFIX}:p1`]: entree('2026-08-01T00:00:00.000Z'),
      github_connection: '{"token":"x"}',
      'vibecore.autre': 'x',
    });

    expect(listEntries(storage, PREFIX).map((e) => e.key)).toEqual([`${PREFIX}:p1`]);
  });

  it('compte en octets UTF-16, pas en caractères', () => {
    /*
     * Compter les caractères sous-estimerait de moitié — et c'est l'erreur qui
     * fait croire qu'on tient dans le budget juste avant de le dépasser.
     */
    const storage = fausseStorage({ [`${PREFIX}:p1`]: 'abcd' });
    const [seule] = listEntries(storage, PREFIX);

    expect(seule.bytes).toBe((`${PREFIX}:p1`.length + 4) * 2);
  });
});

describe('éviction LRU', () => {
  it('ne touche à rien sous le budget', () => {
    const storage = fausseStorage({ [`${PREFIX}:p1`]: entree('2026-08-01T00:00:00.000Z') });

    expect(pruneToBudget(storage, PREFIX)).toEqual([]);
    expect(Object.keys(storage.donnees)).toHaveLength(1);
  });

  it('évince les projets les moins récemment mis à jour d’abord', () => {
    const storage = fausseStorage({
      [`${PREFIX}:vieux`]: entree('2026-01-01T00:00:00.000Z', 400),
      [`${PREFIX}:moyen`]: entree('2026-06-01T00:00:00.000Z', 400),
      [`${PREFIX}:recent`]: entree('2026-08-18T00:00:00.000Z', 400),
    });

    const evincees = pruneToBudget(storage, PREFIX, { budgetBytes: 1800 });

    expect(evincees).toContain(`${PREFIX}:vieux`);
    expect(storage.donnees[`${PREFIX}:recent`]).toBeDefined();
  });

  it('ÉPARGNE TOUJOURS le projet courant, même s’il est le plus ancien', () => {
    /*
     * Évincer ce que l'utilisateur regarde serait pire que l'erreur qu'on évite :
     * il perdrait sa conversation en cours.
     */
    const courant = `${PREFIX}:courant`;

    const storage = fausseStorage({
      [courant]: entree('2020-01-01T00:00:00.000Z', 400),
      [`${PREFIX}:autre`]: entree('2026-08-18T00:00:00.000Z', 400),
    });

    pruneToBudget(storage, PREFIX, { budgetBytes: 100, keepKey: courant });

    expect(storage.donnees[courant]).toBeDefined();
  });

  it('le budget par défaut reste bien sous la limite des navigateurs', () => {
    expect(IDE_MEMORY_BUDGET_BYTES).toBeLessThan(10 * 1024 * 1024);
  });
});

describe('écriture qui ne lève jamais', () => {
  it('écrit normalement quand il y a de la place', () => {
    const storage = fausseStorage();

    expect(writeWithinBudget(storage, PREFIX, `${PREFIX}:p1`, entree('2026-08-18T00:00:00.000Z'))).toBe('written');
  });

  it('fait de la place puis réussit, au lieu de lever', () => {
    const storage = fausseStorage(
      {
        [`${PREFIX}:vieux`]: entree('2026-01-01T00:00:00.000Z', 600),
        [`${PREFIX}:vieux2`]: entree('2026-02-01T00:00:00.000Z', 600),
      },
      { plafondOctets: 3200 },
    );

    const resultat = writeWithinBudget(storage, PREFIX, `${PREFIX}:neuf`, entree('2026-08-18T00:00:00.000Z', 600), {
      budgetBytes: 1200,
    });

    expect(resultat).toBe('written-after-evicting');
    expect(storage.donnees[`${PREFIX}:neuf`]).toBeDefined();
  });

  it('refuse une entrée au-delà du plafond, sans lever', () => {
    /*
     * La garder laisserait un seul projet consommer le budget de tous les autres
     * — la situation même qu'on corrige.
     */
    const storage = fausseStorage();

    expect(writeWithinBudget(storage, PREFIX, `${PREFIX}:enorme`, 'x'.repeat(2_000_000), { entryCapBytes: 1024 })).toBe(
      'skipped-too-large',
    );
    expect(storage.donnees[`${PREFIX}:enorme`]).toBeUndefined();
  });

  it('rend « failed » plutôt que de lever quand le stockage refuse tout', () => {
    const storage = fausseStorage({}, { plafondOctets: 1 });

    expect(() => writeWithinBudget(storage, PREFIX, `${PREFIX}:p1`, entree('2026-08-18T00:00:00.000Z'))).not.toThrow();
    expect(writeWithinBudget(storage, PREFIX, `${PREFIX}:p1`, entree('2026-08-18T00:00:00.000Z'))).toBe('failed');
  });

  it('ne boucle pas : une seule reprise après éviction', () => {
    let appels = 0;

    const storage = fausseStorage({}, {});

    const cassee: BudgetStorage = {
      ...storage,
      setItem() {
        appels += 1;

        const erreur = new Error('QuotaExceededError');
        erreur.name = 'QuotaExceededError';
        throw erreur;
      },
    };

    writeWithinBudget(cassee, PREFIX, `${PREFIX}:p1`, entree('2026-08-18T00:00:00.000Z'));

    expect(appels).toBe(2);
  });
});

describe('total', () => {
  it('somme les tailles', () => {
    expect(
      totalBytes([
        { key: 'a', bytes: 10, updatedAt: 0 },
        { key: 'b', bytes: 5, updatedAt: 0 },
      ]),
    ).toBe(15);
  });
});

describe('câblage dans la mémoire IDE', () => {
  /*
   * Leçon de #145 : un helper correct mais jamais appelé ne corrige rien.
   */
  const memoire = readFileSync('app/lib/persistence/projectIdeMemory.ts', 'utf8');

  it('l’écriture passe par le budget, plus par un setItem nu', () => {
    expect(memoire).toContain('writeWithinBudget(');
    expect(memoire).not.toMatch(/globalThis\.localStorage\.setItem\(storageKeyForScope/u);
  });

  it('la purge se déclenche au chargement du module, côté navigateur', () => {
    expect(memoire).toContain('pruneProjectIdeMemoryOnBoot');
    expect(memoire).toContain('queueMicrotask');
  });

  it('l’écriture reste enveloppée d’un filet de dernier recours', () => {
    /*
     * `writeWithinBudget` est écrit pour ne pas lever, mais cette écriture est
     * appelée depuis la boucle de génération : un `try/catch` de plus coûte
     * une ligne et supprime la seule façon de reproduire le défaut d'origine.
     */
    const bloc = memoire.slice(memoire.indexOf('function writeLocalProjectIdeMemory'));

    expect(bloc.slice(0, 1600)).toContain('try {');
    expect(bloc.slice(0, 1600)).toContain('catch');
  });
});
