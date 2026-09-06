import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Lot IDE-MOBILE-2026-09-05 — cinq captures iPhone d'Avi (22:51–23:05) :
 *   1. la feuille « Outils MCP » ouverte HORS de l'écran (BUG-MOBILE-MCP-001) ;
 *   2. la carte de démarrage de la Webview aux étapes tronquées, et un
 *      « Ancrer à droite » sans volet de droite (BUG-PREVIEW-MOBILE-001) ;
 *   3. le panneau Journaux dont la barre d'outils mangeait l'écran
 *      (BUG-LOGS-MOBILE-001).
 *
 * Mesuré sur le build de production, Chromium, AVANT correction :
 *   - modale à 390 px : left = 195 px pour 366 px de large → 171 px hors écran ;
 *   - modale à 1440 px : left = 720 px, coin haut-gauche au centre, sur bureau
 *     AUSSI. La cause n'est pas mobile : `@keyframes vc-modal-in` animait
 *     `transform`, et `animation-fill-mode: both` remplaçait pour toujours le
 *     `translate(-50%, -50%)` qui centre les modales Radix.
 */

function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const INDEX = sansCommentaires(readFileSync(join(__dirname, 'index.scss'), 'utf8'));

function bloc(selecteur: string): string {
  const debut = INDEX.indexOf(`${selecteur} {`);
  expect(debut, `règle ${selecteur} introuvable`).toBeGreaterThan(-1);

  return INDEX.slice(debut, INDEX.indexOf('}', debut) + 1);
}

describe('1. modales — l’animation d’entrée ne doit jamais écraser le centrage', () => {
  it('`vc-modal-in` anime `scale`, pas `transform`', () => {
    const debut = INDEX.indexOf('@keyframes vc-modal-in {');
    expect(debut).toBeGreaterThan(-1);

    const fin = INDEX.indexOf('\n}\n', debut);
    const keyframes = INDEX.slice(debut, fin);

    expect(keyframes).not.toMatch(/transform\s*:/);
    expect(keyframes).toMatch(/scale\s*:\s*0\.9/);
    expect(keyframes).toMatch(/scale\s*:\s*1\s*;/);
  });

  it('les modales portent toujours cette animation en `both` — le piège reste armé, la garde aussi', () => {
    const regle = bloc("body :where([role='dialog'], .dialog, .modal, .bolt-project-command-palette)");

    expect(regle).toMatch(/animation:\s*vc-modal-in[^;]*both/);
  });
});

describe('2. carte de démarrage de la Webview sur téléphone', () => {
  it('deux colonnes assumées et des libellés qui se replient au lieu d’être tronqués', () => {
    expect(bloc('.bolt-responsive-ide-mobile .bolt-preview-splash-steps')).toMatch(/repeat\(2,/);

    const libelle = bloc('.bolt-responsive-ide-mobile .bolt-preview-splash-steps strong');

    expect(libelle).toMatch(/white-space:\s*normal/);
    expect(libelle).toMatch(/overflow:\s*visible/);
  });

  it('« Ancrer à droite » est masqué : pas de volet de droite sur un téléphone', () => {
    expect(bloc('.bolt-responsive-ide-mobile .bolt-preview-logs-panel header > button')).toMatch(/display:\s*none/);
  });
});

describe('3. panneau Journaux sur téléphone', () => {
  it('une seule famille de boutons : 28 px, 12 px, même bordure', () => {
    const boutons = bloc(
      '.bolt-responsive-ide-mobile .bolt-project-console-header button,\n  .bolt-responsive-ide-mobile .bolt-project-console-header .bolt-project-console-status',
    );

    expect(boutons).toMatch(/height:\s*28px/);
    expect(boutons).toMatch(/font-size:\s*12px\s*!important/);
    expect(boutons).toMatch(/border:\s*1px solid/);
  });

  it('le champ de recherche prend toute la ligne, au plancher iOS de 16 px', () => {
    const champ = bloc('.bolt-responsive-ide-mobile .bolt-project-console-header input');

    expect(champ).toMatch(/flex:\s*1 1 100%/);
    expect(champ).toMatch(/font-size:\s*16px/);
  });

  it('la vue fractionnée est masquée — deux colonnes n’ont pas de sens sur 390 px', () => {
    const cache = bloc(
      ".bolt-responsive-ide-mobile .bolt-project-console-header button[aria-label*='fractionn'],\n  .bolt-responsive-ide-mobile .bolt-project-console-header button[aria-label*='split' i]",
    );

    expect(cache).toMatch(/display:\s*none/);
  });
});
