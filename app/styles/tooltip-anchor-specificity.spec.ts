import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Un ancrage d'infobulle ne doit jamais gagner contre le style d'un composant.
 * Il l'a fait deux fois — `.bolt-agent-scroll-to-bottom` puis
 * `.bolt-message-menu-trigger` — parce que `[attr]:not([attr])` pèse (0,2,0)
 * alors qu'une classe simple ne pèse que (0,1,0).
 *
 * Ce test ne lit pas un commentaire : il EXTRAIT le sélecteur de la feuille et
 * CALCULE sa spécificité. Réécrire l'explication ne le fait pas passer au vert.
 */
const FEUILLE = readFileSync(join(process.cwd(), 'app/styles/index.scss'), 'utf8');

/**
 * Spécificité (a,b,c) d'un sélecteur CSS, réduite à ce qui nous intéresse :
 * b compte les classes, attributs et pseudo-classes. `:where()` ne compte pas ;
 * `:not()` et `:is()` comptent leur argument le plus spécifique.
 */
export function specificiteB(selecteur: string): number {
  let s = selecteur;

  // `:where(...)` ne contribue rien : on retire la construction entière.
  let avant: string;

  do {
    avant = s;
    s = s.replace(/:where\(([^()]*)\)/g, '');
  } while (s !== avant);

  /*
   * `:not(...)` et `:is(...)` contribuent la spécificité de leur argument :
   * on remplace la construction par son contenu, puis on recompte.
   */
  do {
    avant = s;
    s = s.replace(/:(?:not|is)\(([^()]*)\)/g, ' $1 ');
  } while (s !== avant);

  const classes = s.match(/\.[a-zA-Z_-][\w-]*/g) ?? [];
  const attributs = s.match(/\[[^\]]+\]/g) ?? [];
  const pseudoClasses = s.match(/:(?!:)[a-zA-Z-]+/g) ?? [];

  return classes.length + attributs.length + pseudoClasses.length;
}

function selecteurAncrage(): string {
  const i = FEUILLE.indexOf(':where(.bolt-responsive-ide, .bolt-project-ide-shell)');
  expect(i, "la règle d'ancrage des infobulles doit exister").toBeGreaterThan(-1);

  const j = FEUILLE.indexOf('{', i);

  return FEUILLE.slice(i, j).replace(/\s+/g, ' ').trim();
}

describe('ancrage des infobulles', () => {
  it('le calculateur de spécificité est correct (témoins dans les deux sens)', () => {
    // Sans lui, tout le reste du fichier pourrait être vert par accident.
    expect(specificiteB('.une-classe')).toBe(1);
    expect(specificiteB('[data-x]')).toBe(1);
    expect(specificiteB('[data-x]:not([data-y])')).toBe(2); // le piège, chiffré
    expect(specificiteB(':where([data-x])')).toBe(0);
    expect(specificiteB(':where([data-x]):not(:where([data-y]))')).toBe(0);
    expect(specificiteB('div')).toBe(0);
  });

  it("l'ancrage ne pèse pas plus qu'une classe simple", () => {
    const sel = selecteurAncrage();
    const poids = specificiteB(sel);

    expect(
      poids,
      `l'ancrage pèse ${poids} contre 1 pour une classe simple — il écrasera silencieusement ` +
        `le style de tout composant portant data-vc-tooltip. Sélecteur : ${sel}`,
    ).toBeLessThan(specificiteB('.une-classe-de-composant'));
  });

  it('la règle pose bien un ancrage (elle doit continuer à servir à quelque chose)', () => {
    const i = FEUILLE.indexOf(':where(.bolt-responsive-ide, .bolt-project-ide-shell)');
    const bloc = FEUILLE.slice(i, FEUILLE.indexOf('}', i));

    expect(bloc, "l'ancrage doit toujours poser position: relative").toContain('position: relative');
  });
});
