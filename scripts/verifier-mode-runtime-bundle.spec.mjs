import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { analyserBundle, verdict } from './verifier-mode-runtime-bundle.mjs';

/*
 * Les fragments ci-dessous sont RECOPIÉS de bundles réels produits le 2026-09-06
 * par `pnpm build`, avec et sans `VITE_RUNTIME_MODE`. Ce ne sont pas des
 * inventions : le repli `function Ye(){return"webcontainer"}` est la forme que le
 * minifieur produit quand `import.meta.env.VITE_RUNTIME_MODE` vaut `undefined`.
 */
const FRAGMENT_CASSE =
  'React tree");return i}function Ye(){return"webcontainer"}function se(i=Ye(),e={}){return i==="remote-kubernetes"?new $({baseUrl:"/api/runtime"';

const FRAGMENT_SAIN =
  'E_WARNING:"1",VITE_RUNTIME_API_BASE_URL:"https://api.e-code.ai/api/runtime",VITE_RUNTIME_MODE:"remote-kubernetes"},Gk="project"';

/* Présent dans LES DEUX bundles : c'est ce qui rend un `grep` nu inutilisable. */
const COMPARAISON_DE_TYPE = 'this.#e.mode==="remote-kubernetes"){const u=await this.#e.readFile(o)';

function bundle(fichiers) {
  const racine = mkdtempSync(join(tmpdir(), 'bundle-'));
  mkdirSync(join(racine, 'assets'), { recursive: true });

  for (const [nom, contenu] of Object.entries(fichiers)) {
    writeFileSync(join(racine, 'assets', nom), contenu, 'utf8');
  }

  return racine;
}

describe('garde du mode d’exécution inliné dans le bundle', () => {
  it('ROUGE : un bundle construit sans le mode est refusé', () => {
    const racine = bundle({ 'a.js': FRAGMENT_CASSE, 'b.js': COMPARAISON_DE_TYPE });
    const resultat = verdict(analyserBundle(racine));

    expect(resultat.ok).toBe(false);
    expect(resultat.problemes.join(' ')).toContain('replié');
  });

  it('VERT : un bundle construit avec le mode passe', () => {
    const racine = bundle({ 'a.js': FRAGMENT_SAIN, 'b.js': COMPARAISON_DE_TYPE });
    const resultat = verdict(analyserBundle(racine));

    expect(resultat.problemes).toEqual([]);
    expect(resultat.ok).toBe(true);
  });

  /*
   * LE TEST QUI TIENT LA MÉTHODE, et pas seulement le résultat.
   *
   * Il échouerait si quelqu'un remplaçait les deux ancres par une recherche de
   * `remote-kubernetes` nu — la simplification qui vient naturellement à la
   * lecture. Ce bundle-là contient la chaîne et reste pourtant cassé.
   */
  it('le garde ne se laisse pas berner par la chaîne `remote-kubernetes` seule', () => {
    const racine = bundle({ 'a.js': FRAGMENT_CASSE, 'b.js': COMPARAISON_DE_TYPE });
    const mesure = analyserBundle(racine);

    expect(`${FRAGMENT_CASSE}${COMPARAISON_DE_TYPE}`).toContain('remote-kubernetes');
    expect(verdict(mesure).ok).toBe(false);
  });

  it('refuse de conclure sur un chemin sans aucun fichier .js', () => {
    const resultat = verdict(analyserBundle(bundle({})));

    expect(resultat.ok).toBe(false);
    expect(resultat.problemes.join(' ')).toContain('aucun fichier');
  });

  it('compte bien les fichiers examinés — un zéro doit rester détectable', () => {
    expect(analyserBundle(bundle({ 'a.js': FRAGMENT_SAIN })).fichiersExamines).toBe(1);
  });
});
