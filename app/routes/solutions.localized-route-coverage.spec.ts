import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { solutionPages } from '~/components/marketing/EcodeMarketingPages';

/*
 * I18N-FR-001 — garde de couverture des pages Solutions.
 *
 * `makeSolution()` construit chaque entrée de `solutionPages` avec une copie
 * ANGLAISE codée en dur (eyebrow « Solutions », sections « What you can build »
 * / « Production workflow », items « Prompt to project », …). Cette copie n'est
 * jamais rendue aujourd'hui : chacun des slugs possède un fichier de route
 * STATIQUE localisé (`solutions.<slug>.tsx`), que React Router fait gagner sur
 * la route dynamique `solutions.$slug.tsx`.
 *
 * Vérifié EN RÉEL le 2026-08-12 sur l'environnement de test : les 9 pages
 * `/solutions/*` plus `/enterprise` rendent en `<html lang="fr">` sans AUCUNE
 * de ces chaînes, en FR comme en EN.
 *
 * C'est exactement le genre d'invariant qui se périme en silence : ajouter un
 * 10e slug à `solutionPages` sans sa route localisée servirait de l'anglais à
 * un visiteur français, sans que rien n'échoue. D'où cette garde — elle rend le
 * fait vérifiable au lieu de le laisser reposer sur une constatation d'un jour.
 */
describe('Solutions — chaque slug du catalogue a une route statique localisée', () => {
  const routesDir = join(process.cwd(), 'app/routes');

  it('aucun slug ne retombe sur la copie anglaise par défaut de makeSolution()', () => {
    const files = new Set(readdirSync(routesDir));
    const slugs = Object.keys(solutionPages);

    // Garde de non-vacuité : un catalogue vide ferait passer le test pour rien.
    expect(slugs.length).toBeGreaterThan(0);

    const missing = slugs.filter((slug) => !files.has(`solutions.${slug}.tsx`));

    expect(
      missing,
      `Ces slugs n'ont pas de route statique localisée et retomberaient sur la copie ANGLAISE de makeSolution() : ${missing.join(', ')}. ` +
        'Ajoutez app/routes/solutions.<slug>.tsx avec son module de copie localisé, ou localisez makeSolution().',
    ).toEqual([]);
  });
});
