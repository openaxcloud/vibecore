/*
 * Clavier levé : les règles s'appliquent quel que soit l'onglet ouvert.
 *
 * Défaut mesuré sous WebKit en émulation iPhone le 2026-09-24, sur l'IDE d'un
 * vrai projet en production :
 *
 *     data-mobile-panel = "preview"      (et non "chat")
 *     data-vc-clavier   = absent
 *     socle             = position fixed, bottom 0
 *
 * Les quatre règles « clavier ouvert » étaient scopées
 * `[data-mobile-panel='chat']`. L'attribut retient le DERNIER panneau ouvert,
 * donc sur tout autre onglet aucune ne s'appliquait : le socle d'onglets restait
 * affiché et flottait au milieu de l'écran une fois le clavier levé, le
 * composeur n'était plus collé au bas de la zone visible, et la zone de saisie
 * disparaissait. C'est la capture d'Avi, au pixel près.
 *
 * ⚠️ Non reproductible en CI : Playwright n'émule ni le clavier iOS ni le
 * rétrécissement de la fenêtre visuelle — `visualViewport` reste à la taille de
 * la fenêtre et `scale` à 1, avant focus comme après frappe. Cette garde tient
 * donc ce qui EST vérifiable — la portée des sélecteurs — et la preuve à l'écran
 * revient à l'appareil d'Avi.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const INDEX = readFileSync(join(process.cwd(), 'app', 'styles', 'index.scss'), 'utf8');

/** Les blocs dont le sélecteur porte l'état « clavier ouvert ». */
function reglesClavier(): string[] {
  const lignes = INDEX.split('\n');
  const blocs: string[] = [];

  for (let i = 0; i < lignes.length; i += 1) {
    if (!lignes[i].includes("data-vc-clavier='ouvert'")) {
      continue;
    }

    /* Un sélecteur peut tenir sur plusieurs lignes : on remonte jusqu'à l'accolade. */
    let selecteur = lignes[i];

    for (let j = i + 1; j < lignes.length && !selecteur.trimEnd().endsWith('{'); j += 1) {
      selecteur += '\n' + lignes[j];
    }

    blocs.push(selecteur);
  }

  return blocs;
}

describe('les règles « clavier levé »', () => {
  const regles = reglesClavier();

  /* Contrôle positif : sans règle trouvée, la garde ne vérifierait rien. */
  it('sont bien présentes dans la feuille de styles', () => {
    expect(regles.length).toBeGreaterThanOrEqual(3);
  });

  it('ne dépendent d’aucun panneau particulier', () => {
    const fautives = regles.filter((r) => /data-mobile-panel=/.test(r));

    expect(fautives, `règle restreinte à un panneau : ${fautives.join(' | ').slice(0, 220)}`).toEqual([]);
  });

  /*
   * L'autre moitié : déscoper ne doit pas leur faire perdre le gabarit mobile.
   * Appliquées sur bureau, elles masqueraient un socle qui n'a rien à voir.
   */
  it('restent limitées au gabarit mobile', () => {
    for (const r of regles) {
      expect(r, `règle sans gabarit mobile : ${r.slice(0, 120)}`).toMatch(
        /bolt-responsive-ide-mobile|bolt-mobile-replit-nav/,
      );
    }
  });
});
