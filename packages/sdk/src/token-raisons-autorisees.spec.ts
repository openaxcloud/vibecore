import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/*
 * Une énumération vit ici en deux exemplaires : le type `reason` de
 * `token.ts`, et le `textPattern` qui autorise ces littéraux dans le scan
 * i18n — parce que `reason` est une clé « visible » pour le scanner.
 *
 * AUDX-022 a ajouté `insufficient_scope` au type sans l'ajouter au motif. Le
 * scan a rougi en intégration continue, sur trois propositions empilées, à
 * plusieurs heures du commit fautif, et le message ne nommait pas la cause
 * (« new-file-debt », sans dire quel littéral). Ce test fait rougir sur place,
 * et il nomme le littéral manquant.
 *
 * Il lit les DEUX sources sur le disque : ancrer l'un des deux côtés sur une
 * copie locale rendrait le test vert quel que soit l'état réel de l'autre.
 */

const racine = fileURLToPath(new URL('../../../', import.meta.url));

function litterauxDeRaison(): string[] {
  const source = readFileSync(new URL('./token.ts', import.meta.url), 'utf8');
  const declaration = source.match(/reason\?:\s*([^;]+);/u);

  expect(declaration, "la déclaration du type `reason` est introuvable dans token.ts").toBeTruthy();

  return [...declaration![1].matchAll(/'([^']+)'/gu)].map((occurrence) => occurrence[1]);
}

function motifAutorise(): RegExp {
  const autorisations = JSON.parse(readFileSync(`${racine}scripts/i18n/source-allowlist.json`, 'utf8')) as {
    entries: { path: string; rule: string; textPattern?: string }[];
  };

  const entree = autorisations.entries.find(
    (candidate) => candidate.path === 'packages/sdk/src/token.ts' && candidate.rule === 'visible-object-copy',
  );

  expect(entree?.textPattern, "l'autorisation i18n de packages/sdk/src/token.ts est introuvable").toBeTruthy();

  return new RegExp(entree!.textPattern!, 'u');
}

describe("les raisons de vérification et l'autorisation i18n ne divergent pas", () => {
  it('chaque littéral du type est couvert par le motif autorisé', () => {
    const motif = motifAutorise();
    const raisons = litterauxDeRaison();

    expect(raisons.length).toBeGreaterThan(1);
    expect(raisons.filter((raison) => !motif.test(raison))).toEqual([]);
  });

  it('le motif ne couvre rien que le type ne déclare plus', () => {
    const motif = motifAutorise();
    const raisons = new Set(litterauxDeRaison());
    const alternatives = [...(motif.source.match(/\(\?:([^)]+)\)/u)?.[1].split('|') ?? [])];

    expect(alternatives.length).toBeGreaterThan(1);
    expect(alternatives.filter((alternative) => !raisons.has(alternative))).toEqual([]);
  });
});
