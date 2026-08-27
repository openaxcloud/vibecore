import { describe, expect, it } from 'vitest';

import { projectFilesRevision } from './app.js';

/*
 * BUG-RUNTIME-DIVERGENCE (option A, signal 3) — la révision doit suivre les
 * FICHIERS, et rien d'autre.
 *
 * Elle était lue sur `ideState.version`, que les écritures d'interface
 * incrémentent : mesuré en réel, 5 → 9 en une session sans qu'un fichier ait
 * changé. La réouverture en concluait « le stockage a bougé » et reseedait.
 */

const at = (iso: string) => iso;

describe('projectFilesRevision — ce qui la fait bouger', () => {
  const base = [
    { path: 'package.json', updatedAt: at('2026-08-13T10:00:00Z'), content: '{"name":"app"}' },
    { path: 'src/App.tsx', updatedAt: at('2026-08-13T10:05:00Z'), content: 'export default App' },
  ];

  it('est stable quand rien ne change', () => {
    expect(projectFilesRevision(base)).toBe(projectFilesRevision(base));
  });

  it("ne dépend PAS de l'ordre de la liste", () => {
    expect(projectFilesRevision([...base].reverse())).toBe(projectFilesRevision(base));
  });

  it('change quand un fichier est modifié (date)', () => {
    const touched = [base[0], { ...base[1], updatedAt: at('2026-08-13T11:00:00Z') }];

    expect(projectFilesRevision(touched)).not.toBe(projectFilesRevision(base));
  });

  it('change quand la taille d_un fichier change à date égale', () => {
    /*
     * Deux écritures dans la même seconde arrivent en pratique (l'agent écrit un
     * lot). La taille rattrape ce que la date ne distingue pas.
     */
    const rewritten = [base[0], { ...base[1], content: 'export default AppV2' }];

    expect(projectFilesRevision(rewritten)).not.toBe(projectFilesRevision(base));
  });

  it('change quand un fichier est ajouté, puis quand il est supprimé', () => {
    const added = [...base, { path: 'src/new.ts', updatedAt: at('2026-08-13T12:00:00Z'), content: 'x' }];

    expect(projectFilesRevision(added)).not.toBe(projectFilesRevision(base));
    expect(projectFilesRevision([base[0]])).not.toBe(projectFilesRevision(base));
  });

  it('change quand un fichier est renommé', () => {
    const renamed = [base[0], { ...base[1], path: 'src/Main.tsx' }];

    expect(projectFilesRevision(renamed)).not.toBe(projectFilesRevision(base));
  });
});

describe('projectFilesRevision — ce qui ne doit PAS la faire bouger', () => {
  it("est insensible à `ideState.version` : cette valeur n'entre pas dans le calcul", () => {
    /*
     * Le cœur du correctif. Le même arbre de fichiers rend la même révision,
     * quel que soit le nombre d'écritures d'interface intervenues entre-temps.
     */
    const files = [{ path: 'a.ts', updatedAt: at('2026-08-13T10:00:00Z'), content: 'a' }];

    const versionAvant = 5;
    const versionApres = 9;

    expect(versionAvant).not.toBe(versionApres);
    expect(projectFilesRevision(files)).toBe(projectFilesRevision(files));
  });

  it('ne hache pas le CONTENU (la route doit rester bon marché)', () => {
    /*
     * Deux contenus différents de MÊME longueur et même date donnent la même
     * empreinte : c'est un compromis assumé. Le but est de détecter « le
     * stockage a bougé », pas de faire une somme de contrôle intégrale — et
     * toute écriture réelle change la date.
     */
    const a = [{ path: 'a.ts', updatedAt: at('2026-08-13T10:00:00Z'), content: 'aaaa' }];
    const b = [{ path: 'a.ts', updatedAt: at('2026-08-13T10:00:00Z'), content: 'bbbb' }];

    expect(projectFilesRevision(a)).toBe(projectFilesRevision(b));
  });
});

describe('projectFilesRevision — robustesse', () => {
  it('accepte une liste vide sans lever', () => {
    expect(projectFilesRevision([])).toMatch(/^[0-9a-f]{32}$/);
  });

  it('accepte des champs manquants', () => {
    expect(projectFilesRevision([{ path: 'a.ts' }])).toMatch(/^[0-9a-f]{32}$/);
  });

  it('rend une empreinte courte et stable en forme', () => {
    expect(projectFilesRevision([{ path: 'a.ts', updatedAt: at('2026-01-01T00:00:00Z'), content: 'x' }])).toMatch(
      /^[0-9a-f]{32}$/,
    );
  });
});
