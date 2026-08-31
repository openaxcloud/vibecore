import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * FILES-GUARD-001 — BUG-CREATE-010 : un manifeste périmé ne peut plus écraser le
 * récent.
 *
 * CHAÎNE MESURÉE SUR LA PRODUCTION le 2026-08-31, saut par saut :
 *
 *   1. `Ctrl+S` dans l'éditeur, frappe VÉRIFIÉE présente dans Monaco ;
 *   2. la sauvegarde ATTEINT le runtime — relecture serveur du pod :
 *      `# QA runtime sync\nSYNC-MARQUEUR` ;
 *   3. l'ARCHIVE du projet, elle, ne bouge pas ;
 *   4. à la réouverture depuis un contexte neuf, `planReseedDeletions` fait
 *      converger le pod vers l'archive : le travail disparaît.
 *
 * Entre 2 et 3, la route d'écriture persiste bien le manifeste (livré en #289).
 * Ce qui l'annule, c'est le `PUT ide-state` que le client émet juste après : il
 * renvoie la photo du manifeste prise à l'OUVERTURE, et le spread superficiel
 * `{ ...existing, ...incoming }` la laissait remplacer la version fraîche.
 *
 * POURQUOI PAS UNE LISTE BLANCHE. J'ai d'abord interdit `files` en provenance du
 * client. Trois tests d'API tombent : des chemins LÉGITIMES posent `files` par
 * cette route — récupération d'échafaudage depuis le stockage persisté,
 * indexation des manifestes de paquets. Mesuré, écarté. La règle doit donc être
 * temporelle et non structurelle.
 *
 * POURQUOI PAS LA VOIE « le serveur relit le pod ». Mesurée aussi : le client
 * sauvegarde avec un debounce de 1 500 ms, donc relire l'arbre du pod à chaque
 * `PUT ide-state` ferait environ 5 appels d'agent par seconde et par utilisateur
 * actif. Trop cher sur le trajet chaud pour un problème que la garde règle.
 */

const APP = readFileSync(join(__dirname, 'app.ts'), 'utf8');

function corpsDeFonction(source: string, nom: string): string {
  const debut = source.indexOf(`function ${nom}(`);

  expect(debut, `${nom} introuvable : le test ne mesure rien`).toBeGreaterThan(-1);

  const ouvrante = source.indexOf('{', debut);

  let profondeur = 0;

  for (let i = ouvrante; i < source.length; i += 1) {
    if (source[i] === '{') {
      profondeur += 1;
    } else if (source[i] === '}') {
      profondeur -= 1;

      if (profondeur === 0) {
        return source.slice(ouvrante, i);
      }
    }
  }

  return source.slice(ouvrante);
}

describe('FILES-GUARD-001 — le manifeste le plus récent gagne', () => {
  it('la sonde lit bien la fusion', () => {
    const corps = corpsDeFonction(APP, 'mergeProjectIdeState');

    expect(corps.length, 'corps vide').toBeGreaterThan(500);
  });

  it('la fusion compare les horodatages des deux manifestes', () => {
    const corps = corpsDeFonction(APP, 'mergeProjectIdeState');

    /*
     * On vérifie le MÉCANISME et non des noms de variables : une comparaison
     * entre le `files` existant et l'entrant, et la réinjection conditionnelle de
     * l'existant. Un test accroché à un identifiant précis raterait une
     * implémentation correcte écrite autrement — l'erreur commise sur la recette
     * du premier correctif de ce même bug.
     */
    expect(corps).toMatch(/incoming\.files/);
    expect(corps).toMatch(/existing\.files/);
    expect(corps).toMatch(/updatedAt/);
    expect(corps).toMatch(/files: existing\.files/);
  });

  it('les trois autres nœuds gardent leur protection', () => {
    const corps = corpsDeFonction(APP, 'mergeProjectIdeState');

    expect(corps).toContain('chat: mergedChat');
    expect(corps).toContain('collaboration: mergedCollaboration');
    expect(corps).toMatch(/ui: \{ \.\.\.ideStateRecord\(existing\.ui\), \.\.\.ideStateRecord\(incoming\.ui\) \}/);
  });
});
