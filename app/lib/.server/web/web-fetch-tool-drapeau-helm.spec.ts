import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isWebFetchToolEnabled } from './web-fetch-tool';

/*
 * LE DRAPEAU DOIT ÊTRE POSABLE, sinon la fonctionnalité est livrée et
 * inatteignable.
 *
 * MESURÉ le 09/09 : `ECODE_WEB_FETCH_TOOL_ENABLED` n'apparaissait NULLE PART
 * sous `infra/` — recherche sur tout l'arbre, avec témoin positif sur
 * `ECODE_PARALLEL_SUBAGENTS_ENABLED`, qui ressort bien du configmap. L'outil
 * `fetch_web_page` était donc codé, testé, et impossible à allumer : aucun
 * opérateur ne pouvait poser la variable.
 *
 * DEUX PIÈGES, et le second est celui que le graphe documente lui-même vingt
 * lignes plus haut dans `configmap.yaml` :
 *
 *  1. une entrée placée DANS un `{{- if }}` n'est pas rendue quand la condition
 *     est fausse — et une clé de valeurs AJOUTÉE vaut `nil` sous
 *     `helm upgrade --reuse-values`, ce que fait la livraison continue. C'est
 *     exactement ainsi qu'un `parallelSubagentsEnabled` dédié « n'a jamais été
 *     rendu » ;
 *  2. rendue sans garde, l'entrée vaudrait `""` — ce qui est éteint, mais par
 *     accident. `default "0"` la rend toujours, et toujours explicitement.
 *
 * Ce test lit la SOURCE du graphe (règle 5) : il n'a pas besoin de `helm`, donc
 * il tourne partout, y compris là où le binaire n'est pas installé.
 */

const CONFIGMAP = join(process.cwd(), 'infra/helm/platform/templates/configmap.yaml');
const VALUES = join(process.cwd(), 'infra/helm/platform/values.yaml');
const CLE = 'ECODE_WEB_FETCH_TOOL_ENABLED';

/** Profondeur de blocs `{{- if }}` / `{{- range }}` / `{{- with }}` à chaque ligne. */
function profondeurs(texte: string): Array<{ ligne: string; profondeur: number }> {
  let profondeur = 0;

  return texte.split('\n').map((ligne) => {
    const ferme = (ligne.match(/\{\{-?\s*end\s*-?\}\}/g) ?? []).length;
    const ouvre = (ligne.match(/\{\{-?\s*(if|range|with)\s/g) ?? []).length;

    // Un `end` sur la ligne referme AVANT qu'on ne juge la ligne elle-même.
    profondeur -= ferme;

    const auNiveauDeLaLigne = profondeur;

    profondeur += ouvre;

    return { ligne, profondeur: auNiveauDeLaLigne };
  });
}

describe('le drapeau de l’outil fetch_web_page est posable en production', () => {
  it('témoin positif : le compteur de blocs sait reconnaître un conditionnel', () => {
    const echantillon = ['a: 1', '{{- if .Values.x }}', 'b: 2', '{{- end }}', 'c: 3'].join('\n');
    const lues = profondeurs(echantillon);

    expect(lues.find((l) => l.ligne === 'a: 1')?.profondeur).toBe(0);
    expect(lues.find((l) => l.ligne === 'b: 2')?.profondeur).toBe(1);
    expect(lues.find((l) => l.ligne === 'c: 3')?.profondeur).toBe(0);
  });

  it('l’entrée existe dans le configmap, et HORS de tout bloc conditionnel', () => {
    const texte = readFileSync(CONFIGMAP, 'utf8');
    const lignes = profondeurs(texte).filter((l) => l.ligne.includes(`${CLE}:`));

    expect(lignes).toHaveLength(1);

    /*
     * Profondeur 0 = rendue quoi qu'il arrive. C'est LA propriété : dans un
     * conditionnel, une clé absente des valeurs réutilisées ne serait jamais
     * rendue, et le drapeau redeviendrait impossible à poser.
     */
    expect(lignes[0].profondeur).toBe(0);
  });

  it('l’entrée porte `default "0"` : une release antérieure à la clé reste ÉTEINTE', () => {
    const texte = readFileSync(CONFIGMAP, 'utf8');
    const ligne = texte.split('\n').find((l) => l.includes(`${CLE}:`)) ?? '';

    expect(ligne).toContain('.Values.platformEnv.webFetchToolEnabled');
    expect(ligne).toContain('default "0"');
    expect(ligne).toContain('quote');
  });

  it('la valeur est déclarée, et sa valeur par défaut est éteinte des DEUX côtés', () => {
    expect(readFileSync(VALUES, 'utf8')).toContain("webFetchToolEnabled: '0'");

    // Le code et le graphe doivent s'accorder sur ce qui vaut « éteint ».
    expect(isWebFetchToolEnabled({ ECODE_WEB_FETCH_TOOL_ENABLED: '0' })).toBe(false);
    expect(isWebFetchToolEnabled({ ECODE_WEB_FETCH_TOOL_ENABLED: '' })).toBe(false);
    expect(isWebFetchToolEnabled({ ECODE_WEB_FETCH_TOOL_ENABLED: '1' })).toBe(true);
  });
});
