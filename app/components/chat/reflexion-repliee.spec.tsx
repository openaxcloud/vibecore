/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import ThoughtBox from './ThoughtBox';

/*
 * LE RAISONNEMENT EST AFFICHÉ, MAIS REPLIÉ.
 *
 * Avi tranche le 2026-09-10 : « affiché mais replié — un bandeau présent pendant
 * et après la génération, fermé par défaut, qu'on ouvre d'un geste ». Le contenu
 * utile — les fichiers, l'artefact — reste au premier plan.
 *
 * CE LOT N'ÉCRIT PAS DE RENDU, PARCE QU'IL EXISTE DÉJÀ. Mesuré avant d'écrire :
 * `AssistantMessage.tsx:963` rend les parts `reasoning` dans un `ThoughtBox`,
 * `ThoughtBox` démarre à `useState(false)`, et son contenu porte
 * `hidden={!isExpanded}`. Les quatre exigences d'Avi sont donc déjà satisfaites
 * par le code en place — ce qui manquait, c'est la GARDE.
 *
 * Elle devient portante avec la montée à `@ai-sdk/anthropic@1.2.12` : jusqu'ici
 * le SDK ne remontait aucune part `reasoning`, donc personne n'aurait vu une
 * régression du repli. À partir de maintenant, Anthropic en émet à chaque tour
 * opus — un `useState(true)` posé par mégarde repousserait le contenu utile hors
 * d'un écran de 390 px, et rien ne le dirait.
 */

afterEach(() => cleanup());

describe('le bandeau de réflexion est REPLIÉ au premier rendu', () => {
  it('AU PREMIER RENDU — pas après interaction : le contenu est masqué', () => {
    /*
     * L'exigence porte sur le PREMIER rendu. Un bandeau qui s'ouvrirait puis se
     * refermerait aurait déjà repoussé le contenu utile — l'utilisateur l'aurait
     * vu sauter.
     */
    render(
      <ThoughtBox title="Réflexion">
        <p>raisonnement du modèle</p>
      </ThoughtBox>,
    );

    const bouton = screen.getByRole('button');

    expect(bouton.getAttribute('aria-expanded'), 'le bandeau doit être fermé au premier rendu').toBe('false');

    const contenu = document.getElementById(bouton.getAttribute('aria-controls') ?? '');

    expect(contenu, 'la zone de contenu doit exister et être adressée par aria-controls').not.toBeNull();
    expect(contenu?.hasAttribute('hidden'), 'le contenu doit être MASQUÉ, pas seulement transparent').toBe(true);
  });

  it('le contenu masqué ne coûte aucune place — `hidden`, pas une opacité', () => {
    /*
     * `opacity: 0` ou une hauteur nulle laisseraient le nœud dans le flux. Sur
     * 390 px, plusieurs paragraphes de réflexion repousseraient l'artefact hors
     * de l'écran sans qu'on voie pourquoi.
     */
    const source = readFileSync('app/components/chat/ThoughtBox.tsx', 'utf8');

    expect(source).toContain('hidden={!isExpanded}');
    expect(source, 'le repli ne doit pas reposer sur une opacité').not.toMatch(/opacity-0["`\s]/u);
  });

  it("s'ouvre d'UN geste, avec une cible tactile atteignable", () => {
    const source = readFileSync('app/components/chat/ThoughtBox.tsx', 'utf8');

    // 44 px : la cible minimale d'Avi sur iPhone. `min-h-11` vaut 2,75rem = 44 px.
    expect(source).toContain('min-h-11');
    expect(source).toContain('onClick={() => setIsExpanded((value) => !value)}');
  });

  it('TÉMOIN — le composant rend bien quelque chose, et son titre', () => {
    render(
      <ThoughtBox title="Réflexion">
        <p>raisonnement</p>
      </ThoughtBox>,
    );

    // Le titre apparaît dans le libellé du bouton ET dans son aria-label : les deux comptent.
    expect(screen.getAllByText('Réflexion').length).toBeGreaterThan(0);
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('Réflexion');
  });
});
