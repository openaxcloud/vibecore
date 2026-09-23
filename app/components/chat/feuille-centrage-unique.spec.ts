/*
 * UN SEUL système de centrage pour la feuille des modes.
 *
 * Défaut mesuré en production le 2026-09-23, à 390×844, sur `20111802ec` :
 * la feuille partait à -195 px, moitié gauche hors écran — « …ns de
 * facturation », les chevrons dans le vide, le coût collé au bord.
 *
 * Deux règles se recouvraient à moitié : l'une centre par `left: 50%` +
 * `transform: translateX(-50%)`, l'autre par `left` + `width`. Le bloc dédié de
 * la feuille gagnait sur `left` (0 sur téléphone) mais pas sur la
 * transformation, qui continuait de décaler d'une demi-largeur.
 *
 * Aucun test de rendu n'attrape ça : jsdom ne met rien en page, et la feuille
 * était parfaitement présente dans le DOM. Il faut lire le CSS.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const INDEX = readFileSync(join(process.cwd(), 'app', 'styles', 'index.scss'), 'utf8');

const BLOC_DEDIE = '.bolt-project-ide-shell .bolt-responsive-ide-mobile .bolt-agent-power-popover {';

function blocDedie(): string {
  const debut = INDEX.indexOf(BLOC_DEDIE);

  expect(debut, 'le bloc dédié de la feuille est introuvable').toBeGreaterThan(-1);

  return INDEX.slice(debut, INDEX.indexOf('\n}', debut));
}

describe('la feuille des modes n’a qu’un seul centrage', () => {
  it('elle se centre par left et width, pas par transformation', () => {
    const bloc = blocDedie();

    expect(bloc).toMatch(/left:\s*max\(0px,/);
    expect(bloc).toMatch(/width:\s*min\(100vw,/);
  });

  /*
   * L'assertion qui compte : sans elle, la transformation de l'autre règle
   * revient s'appliquer et la feuille repart hors écran.
   */
  it('elle annule explicitement la transformation de l’autre règle', () => {
    expect(blocDedie()).toMatch(/transform:\s*none\s*!important/);
  });

  it('l’autre règle porte bien la transformation qu’on neutralise — sinon cette garde ne garde rien', () => {
    const autre = INDEX.indexOf('.bolt-responsive-ide-mobile .bolt-agent-power-popover {\n    position: fixed');

    expect(autre, 'la règle au transform est introuvable : la garde a perdu son objet').toBeGreaterThan(-1);
    expect(INDEX.slice(autre, INDEX.indexOf('\n  }', autre))).toMatch(/transform:\s*translateX\(-50%\)/);
  });
});
