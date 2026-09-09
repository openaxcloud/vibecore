import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * BUG-PREVIEW-CUTOFF-001 — point 8 d'Avi : « il faut voir tous les écrans qui
 * s'affichent dans la tab preview et s'assurer que rien n'est coupé pour tous
 * les types de devices, et toujours faire des écrans clairs et compréhensibles
 * pour l'utilisateur, comme si c'est pas un ingénieur ».
 *
 * MESURÉ le 09/09 sur la feuille de styles RÉELLE, aux trois formats
 * (390 / 834 / 1280), avant correctif :
 *
 *   « Démarrage du serveur de développement » .... 259 px de texte dans 102 px
 *   « Préparation de l'espace de travail » ....... 211 px dans 102 px
 *   « Installation de 1 248 paquets — … » ........ 343 px dans 171 px (390 px)
 *
 * Le `text-overflow: ellipsis` faisait exactement son travail : il coupait. Et
 * ce qu'il coupait, c'était la phrase qui EXPLIQUE l'attente — précisément ce
 * qu'Avi demande de rendre lisible. Après correctif : 0 débordement aux trois
 * formats.
 *
 * Ce test tient le MÉCANISME, dans la feuille de styles que le composant
 * utilise vraiment. La géométrie, elle, est vérifiée à l'écran par la sonde
 * Playwright — mais une mesure vaut pour le jour où elle est prise, une règle
 * vaut pour tous les jours suivants.
 */
const SCSS = readFileSync(new URL('../../styles/index.scss', import.meta.url), 'utf8');

/** Le corps d'une règle CSS, par son sélecteur exact. */
function corpsDeRegle(selecteur: string): string {
  const debut = SCSS.indexOf(`${selecteur} {`);

  expect(debut, `la règle « ${selecteur} » doit exister — sinon ce test ne mesure rien`).toBeGreaterThan(-1);

  const fin = SCSS.indexOf('}', debut);

  return SCSS.slice(debut, fin);
}

describe('écran de démarrage de l’Aperçu — aucun texte tronqué', () => {
  it('les libellés des étapes REVIENNENT À LA LIGNE au lieu d’être coupés', () => {
    const regle = corpsDeRegle('.bolt-preview-splash-steps strong');

    expect(regle, 'une étape coupée est illisible').not.toContain('white-space: nowrap');
    expect(regle, 'et les points de suspension ne sont plus la réponse').not.toContain('text-overflow: ellipsis');
    expect(regle).toContain('white-space: normal');
  });

  it('la ligne de tâche en cours aussi — c’est elle qui explique l’attente', () => {
    const regle = corpsDeRegle('.bolt-preview-splash-task small');

    expect(regle).not.toContain('white-space: nowrap');
    expect(regle).not.toContain('text-overflow: ellipsis');
    expect(regle).toContain('white-space: normal');
  });

  it('et la bande d’étapes passe à deux colonnes sur téléphone', () => {
    const regle = corpsDeRegle('.bolt-preview-splash-steps');

    expect(regle, 'quatre colonnes sur 390 px ne laissent que ~80 px par libellé').toContain(
      'grid-template-columns: repeat(2, minmax(0, 1fr))',
    );

    /* Les quatre colonnes restent, au-dessus de 640 px, dans leur média. */
    expect(SCSS).toMatch(
      /@media \(min-width: 640px\) \{\s*\.bolt-preview-splash-steps \{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/u,
    );
  });
});
