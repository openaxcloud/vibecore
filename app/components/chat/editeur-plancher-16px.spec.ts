/*
 * L'éditeur de code ne descend pas sous 16 px sur téléphone.
 *
 * Safari iOS zoome sur tout champ dont la police effective est sous 16 px, et
 * une fois zoomé il le reste. Mesuré sous le moteur WEBKIT en émulation iPhone
 * le 2026-09-24 : `cm-content` rendait `14px`. C'est le seul champ du produit
 * sous le seuil — le composeur de l'agent, lui, rend bien 16 px sous WebKit.
 *
 * La garde lit la feuille de styles, jamais une copie, et tient les deux
 * moitiés : le plancher existe, et il vise bien la surface éditable.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const INDEX = readFileSync(join(process.cwd(), 'app', 'styles', 'index.scss'), 'utf8');

function blocDuPlancher(): string {
  const debut = INDEX.indexOf('.bolt-responsive-ide-mobile .cm-editor,');

  expect(debut, 'le plancher de police de l’éditeur est introuvable').toBeGreaterThan(-1);

  return INDEX.slice(debut, INDEX.indexOf('\n  }', debut));
}

describe('le plancher de 16 px sur l’éditeur mobile', () => {
  it('vise les trois surfaces de CodeMirror, dont le contenteditable', () => {
    const bloc = blocDuPlancher();

    expect(bloc).toContain('.cm-editor');
    expect(bloc, 'c’est `cm-content` qui porte le contenteditable — sans lui, iOS zoome').toContain('.cm-content');
    expect(bloc).toContain('.cm-scroller');
  });

  it('pose un plancher, pas une valeur fixe — le réglage reste libre au-dessus', () => {
    const bloc = blocDuPlancher();

    expect(bloc).toMatch(/font-size:\s*max\(16px,/);
  });

  /*
   * Le thème de CodeMirror pose sa taille via `EditorView.theme` sur `&`, une
   * feuille générée de forte spécificité. Sans `!important`, le plancher ne
   * s'applique pas — et la garde passerait au vert sur une règle inerte.
   */
  it('l’emporte sur la feuille générée par CodeMirror', () => {
    expect(blocDuPlancher()).toMatch(/font-size:[^;]*!important/);
  });

  it('ne s’applique qu’au gabarit mobile — le bureau garde son réglage', () => {
    const bloc = blocDuPlancher();

    expect(bloc.split('\n')[0]).toContain('.bolt-responsive-ide-mobile');
  });
});
