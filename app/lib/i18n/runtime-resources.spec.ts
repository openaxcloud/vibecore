import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SUPPORTED_LANGUAGES } from './language';
import { RESOURCES } from './runtime-resources';

/**
 * BUG-PERF-I18N-RACINE-001 — trois choses que le découpage par langue suppose,
 * et que rien d'autre ne tient.
 *
 * 1. PARITÉ en/fr. `languesRequises('fr')` ne charge PAS l'anglais : un
 *    document français compte sur le fait que chaque clé anglaise a sa
 *    version française. Mesuré le 2026-09-14 : 10 548 = 10 548, zéro écart.
 *    Si une clé n'existe qu'en anglais, un utilisateur français verra
 *    « Unavailable » là où il voyait le texte anglais — ce test le dit AVANT.
 *
 * 2. `runtime-resources.ts` reste HORS du client. C'est tout le correctif :
 *    un import depuis un module atteignable par le navigateur remettrait
 *    1,4 Mo de texte sur chaque page, et le manifeste ne le dirait qu'après
 *    un build complet.
 *
 * 3. `runtime.ts` n'importe aucun catalogue — même garde, vue de l'autre côté.
 */

const RACINE_APP = join(process.cwd(), 'app');

function fichiersSource(dossier: string, resultat: string[] = []): string[] {
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name);

    if (entree.isDirectory()) {
      fichiersSource(chemin, resultat);
    } else if (/\.tsx?$/.test(entree.name) && !/\.spec\.tsx?$/.test(entree.name)) {
      resultat.push(chemin);
    }
  }

  return resultat;
}

describe('les ressources statiques i18n', () => {
  const clesEn = new Set(Object.keys(RESOURCES.en.translation));
  const clesFr = new Set(Object.keys(RESOURCES.fr.translation));

  it('mesurent bien quelque chose : plus de 10 000 clés par langue principale', () => {
    // Règle 4 : une parité entre deux ensembles vides serait un vert creux.
    expect(clesEn.size).toBeGreaterThan(10_000);
    expect(clesFr.size).toBeGreaterThan(10_000);
  });

  it('en et fr portent EXACTEMENT les mêmes clés — un document français ne charge pas l’anglais', () => {
    const enSansFr = [...clesEn].filter((cle) => !clesFr.has(cle));
    const frSansEn = [...clesFr].filter((cle) => !clesEn.has(cle));

    expect(enSansFr, 'clés présentes en anglais mais absentes du français').toEqual([]);
    expect(frSansEn, 'clés présentes en français mais absentes de l’anglais').toEqual([]);
  });

  it('es et ar sont des sous-ensembles de en — leur repli anglais est bien chargé avec eux', () => {
    for (const langue of ['es', 'ar'] as const) {
      const orphelines = Object.keys(RESOURCES[langue].translation).filter((cle) => !clesEn.has(cle));
      expect(orphelines, `clés ${langue} sans équivalent anglais`).toEqual([]);
    }
  });

  it('couvrent les quatre langues supportées, ni plus ni moins', () => {
    expect(Object.keys(RESOURCES).sort()).toEqual([...SUPPORTED_LANGUAGES].sort());
  });
});

describe('runtime-resources.ts reste hors du navigateur', () => {
  const AUTORISES = [
    join(RACINE_APP, 'entry.server.tsx'),
    join(RACINE_APP, 'lib', 'i18n', 'catalogues-vitest.global.ts'),
  ];

  it('n’est importé que par l’entrée serveur et le globalSetup de vitest', () => {
    const importeurs = fichiersSource(RACINE_APP).filter((fichier) => {
      const code = readFileSync(fichier, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

      return /from\s+['"][^'"]*runtime-resources['"]/.test(code);
    });

    // Règle 14 : la recherche doit trouver les deux importeurs connus, sinon elle ne cherche pas.
    expect(importeurs.sort()).toEqual([...AUTORISES].sort());
  });

  it('runtime.ts n’importe plus aucun catalogue', () => {
    const runtime = readFileSync(join(RACINE_APP, 'lib', 'i18n', 'runtime.ts'), 'utf8');

    expect(runtime).not.toMatch(/from\s+['"]\.\/catalogs\//);
    expect(runtime).not.toMatch(/from\s+['"][^'"]*runtime-resources['"]/);
  });

  it('root.tsx et entry.client.tsx passent par le registre, jamais par les ressources statiques', () => {
    for (const nom of ['root.tsx', 'entry.client.tsx']) {
      const code = readFileSync(join(RACINE_APP, nom), 'utf8');
      expect(code, nom).not.toContain('runtime-resources');
    }
  });
});
