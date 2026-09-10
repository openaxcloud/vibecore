import { describe, expect, it } from 'vitest';
import { cleanFileActionContent } from './message-parser';

/*
 * LE NETTOYAGE DE « CODE COLORISÉ » NE DOIT PAS TOUCHER À DU CODE SOURCE.
 *
 * MESURÉ sur la vraie fonction, avant correctif : un composant React ordinaire
 * — trois spans Tailwind colorés et un <br /> — perdait ses trois <span> et son
 * <br />, écrits ARRACHÉS dans le fichier. Le seuil « 3 spans + un <br/> » était
 * franchi par du JSX parfaitement légitime.
 *
 * C'était la DEUXIÈME fois que ce mécanisme mordait : le commentaire du parseur
 * raconte la première, où un seul `text-*` suffisait. La leçon est qu'un seuil
 * de QUANTITÉ ne sépare pas les deux mondes — seule la STRUCTURE le fait. Une
 * sortie de coloriseur enveloppe chaque jeton ; un module source porte ses
 * mots-clés en clair, hors de toute balise.
 *
 * Ce test tient les DEUX moitiés : le code source reste intact, et la vraie
 * coloration continue d'être nettoyée. Sans la seconde, un correctif qui
 * désactiverait purement le nettoyage passerait au vert.
 */

const composantTailwind = `export function Prix({ montant, devise }: Props) {
  return (
    <div className="rounded-lg border p-4">
      <span className="text-slate-500">Total</span>
      <br />
      <span className="text-green-600">{montant}</span>
      <span className="text-gray-400">{devise}</span>
      <p>Merci pour votre commande.</p>
    </div>
  );
}
`;

describe('du code source ne doit JAMAIS être nettoyé comme de la coloration', () => {
  it('un composant React à trois spans colorés et un <br /> reste INTACT', () => {
    expect(cleanFileActionContent(composantTailwind, 'src/Prix.tsx')).toBe(composantTailwind);
  });

  it('la protection tient sur d’autres langages, pas seulement sur du JSX', () => {
    const python = `import os

def rendre():
    return "<span class='text-red-500'>a</span><br/><span class='text-blue-500'>b</span><span class='text-green-500'>c</span>"
`;
    expect(cleanFileActionContent(python, 'src/app.py')).toBe(python);
  });

  it('un module SANS structure déclarative reste protégé par le seuil de spans', () => {
    // Deux spans seulement : sous le seuil, donc intact quoi qu'il arrive.
    const fragment = `<div><span className="text-red-500">a</span><br/><span className="text-blue-500">b</span></div>`;
    expect(cleanFileActionContent(fragment, 'src/F.tsx')).toBe(fragment);
  });
});

describe('la vraie coloration syntaxique continue d’être nettoyée', () => {
  it('une sortie de coloriseur reconnaissable à sa classe est nettoyée, même avec une structure apparente', () => {
    const shiki = `<pre class="shiki"><code><span class="line"><span style="color:#C678DD">export</span><span style="color:#ABB2BF"> const a = 1</span></span><br/></code></pre>`;
    const sortie = cleanFileActionContent(shiki, 'src/a.ts');

    expect(sortie).not.toContain('<span');
    expect(sortie).toContain('export');
  });

  it('des spans colorés SANS aucune structure de module sont bien nettoyés', () => {
    const colorise = `<span class="text-red-500">a</span><br/><span class="text-blue-500">b</span><br/><span class="text-green-500">c</span>`;
    const sortie = cleanFileActionContent(colorise, 'src/a.txt');

    expect(sortie).not.toContain('<span');
    expect(sortie).toContain('a');
    expect(sortie).toContain('b');
  });
});
