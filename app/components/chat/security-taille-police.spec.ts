import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * BUG-SECURITY-FONT-001 — Avi (point 5) : « pour la tab sécurité est-ce que
 * c'est la même taille de police que ce qu'on a fait partout ? »
 *
 * La réponse était NON, et elle se chiffre. Mesuré le 09/09 à 390 px, panneau
 * contre panneau, sur la feuille de styles réelle :
 *
 *   Secrets (la référence, déjà alignée) ... titre `h2` à 22px
 *   Sécurité ............................... titre `h3` à 12px
 *
 * Le titre était donc PLUS PETIT que le texte qu'il coiffe (13-14px). Son
 * `h3` ne porte aucune classe : il tombait dans la remise à plat de la coque
 * de l'IDE, que Secrets avait contournée par une exception explicite et que
 * personne n'avait posée pour Sécurité.
 *
 * Ce test tient la règle là où elle vit. La mesure à l'écran (12px → 22px) a
 * été refaite après correctif ; un test vaut pour les jours suivants.
 */
const SCSS = readFileSync(new URL('../../styles/index.scss', import.meta.url), 'utf8');

describe('onglet Sécurité — la taille du titre', () => {
  it('porte la même taille que le titre de Secrets, et par le même mécanisme', () => {
    const regle = SCSS.match(
      /\.bolt-project-ide-shell \.bolt-project-security-summary h3,[\s\S]{0,160}?\{\s*font-size: (\d+)px !important;/u,
    );

    expect(regle, 'la règle de taille du titre Sécurité doit exister').not.toBeNull();
    expect(regle![1], 'même taille que le titre Secrets').toBe('22');
  });

  it('et la référence Secrets n’a pas bougé — sinon les deux ne sont plus comparables', () => {
    const secrets = SCSS.match(
      /\.bolt-project-ide-shell \.bolt-secrets \.bolt-secrets-title,[\s\S]{0,160}?\{\s*font-size: (\d+)px !important;/u,
    );

    expect(secrets, 'la règle de référence doit exister').not.toBeNull();
    expect(secrets![1]).toBe('22');
  });
});
