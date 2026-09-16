import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * BUG-QA-GUARD-BLIND-001 — les gardes de débordement horizontal du e2e étaient
 * STRUCTURELLEMENT incapables d'échouer sur ce produit.
 *
 * `app/styles/index.scss` pose `overflow-x: clip` sur html ET body. Sous ce
 * clip, `document.documentElement.scrollWidth` est borné à `clientWidth` par
 * construction : un bloc de 3 000 px injecté laissait la métrique à 390 et le
 * verdict à « PASSE » (mesuré le 01/09 sur /organization-roles : garde verte,
 * 266 px réellement amputés). La métrique honnête est `document.body.scrollWidth`
 * — c'est celle de `tests/e2e/mobile-content-clipping.spec.ts`, qui embarque la
 * contre-épreuve.
 *
 * 39 sites dans 17 specs lisaient la métrique aveugle le 16/09. Ce test tient la
 * migration : aucun spec e2e ne doit relire `documentElement.scrollWidth` comme
 * mesure. Le seul fichier autorisé à la NOMMER est celui qui documente pourquoi
 * elle est fausse.
 */
const DOSSIER = join(process.cwd(), 'tests/e2e');
const DOCUMENTE_LE_PIEGE = 'mobile-content-clipping.spec.ts';

const specs = readdirSync(DOSSIER).filter((nom) => nom.endsWith('.spec.ts'));

describe('BUG-QA-GUARD-BLIND-001 — les gardes de débordement lisent la métrique que le clip ne borne pas', () => {
  it('le dossier e2e existe et porte des gardes de débordement (contrôle positif)', () => {
    expect(specs.length).toBeGreaterThan(20);

    const lecteurs = specs.filter((nom) =>
      readFileSync(join(DOSSIER, nom), 'utf8').includes('document.body.scrollWidth'),
    );
    expect(lecteurs.length, 'au moins dix specs mesurent body.scrollWidth').toBeGreaterThanOrEqual(10);
  });

  it('aucun spec e2e ne mesure `documentElement.scrollWidth`, bornée par `overflow-x: clip`', () => {
    const fautifs = specs
      .filter((nom) => nom !== DOCUMENTE_LE_PIEGE)
      .filter((nom) => /documentElement\.scrollWidth/.test(readFileSync(join(DOSSIER, nom), 'utf8')));

    expect(fautifs).toEqual([]);
  });

  it('le spec de référence garde sa contre-épreuve : un bloc injecté doit faire réagir la métrique', () => {
    const source = readFileSync(join(DOSSIER, DOCUMENTE_LE_PIEGE), 'utf8');

    expect(source).toContain('document.body.scrollWidth');
    expect(source).toMatch(/3000|3_000/);
  });
});
