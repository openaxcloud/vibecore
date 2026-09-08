import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/*
 * BUG-AGENT-UI-001 — le transcript de l'agent réservait deux fois la place du
 * composeur, sur mobile.
 *
 * Il existe DEUX mises en page, et la réserve n'est juste que dans l'une :
 *
 *   - composeur DANS la même boîte de défilement que le transcript : il est
 *     `sticky`, il se pose donc par-dessus les derniers messages, et la réserve
 *     est nécessaire ;
 *   - composeur FRÈRE du conteneur défilant que `StickToBottom` intercale autour
 *     du transcript — c'est le rendu réel : il ne recouvre jamais rien, et la
 *     réserve compte l'espace deux fois.
 *
 * Mesuré en réel (mobile 390, env de test, sur une génération) : boîte
 * `.bolt-project-agent-scroll` de 796 px qui NE défile pas, conteneur interne de
 * 400 px qui défile avec 3510 px de contenu, `padding-bottom: 288px` — le
 * dernier texte s'arrêtait à y = 181 px, soit plus de la moitié de la fenêtre de
 * lecture en vide réservé. Réserve retirée : y = 468 px.
 *
 * Ce test lit la feuille : c'est une règle de mise en page, il n'y a rien à
 * appeler. Il fige les deux moitiés de l'invariant, pour qu'on ne « simplifie »
 * pas l'une en cassant l'autre.
 */

const FEUILLE = new URL('./index.scss', import.meta.url).pathname;

function bloc(source: string, selecteur: string): string {
  const debut = source.indexOf(selecteur);

  expect(debut, `sélecteur introuvable : ${selecteur}`).toBeGreaterThan(-1);

  const ouvrante = source.indexOf('{', debut);
  const fermante = source.indexOf('}', ouvrante);

  return source.slice(ouvrante + 1, fermante);
}

describe('transcript de l’agent en mobile', () => {
  const source = readFileSync(FEUILLE, 'utf8');

  it('garde la réserve quand le composeur recouvre le transcript', () => {
    const base = bloc(source, '.bolt-responsive-ide-mobile .bolt-project-agent-transcript {');

    expect(base).toContain('--vc-agent-composer-reserved-space');
  });

  it('retire la réserve quand le transcript est imbriqué dans son propre conteneur défilant', () => {
    const imbrique = bloc(source, '> div:not(.bolt-project-agent-transcript)');

    expect(imbrique).not.toContain('--vc-agent-composer-reserved-space');

    const valeur = /padding-bottom:\s*([0-9]+)px/.exec(imbrique)?.[1];

    expect(valeur, 'une respiration fixe doit rester sous le dernier message').toBeDefined();
    expect(Number(valeur)).toBeGreaterThan(0);
    expect(Number(valeur)).toBeLessThanOrEqual(24);
  });

  /*
   * BUG-THREAD-TOP-GAP-001 — Avi, capture iPhone du 07/09 08:06 (renvoyée le
   * 08/09) : « retire cette espace, ça cache le contenu et perd de la place ».
   * Mesuré le 08/09 à 390 (Chromium) : en-tête jusqu'à 49, boîte de défilement
   * à partir de 62 — 13 px de bande morte, le `padding-top` de
   * `.bolt-project-agent-scroll`, qui ne défile pas ; et la première bulle à 47,
   * ses 15 premiers pixels rognés par le quai vide de la ligne d'état
   * (`-mt-6` = -21 px, plus l'écart de colonne de 6 px).
   *
   * Trois moitiés d'un même invariant : pas de gouttière sur la boîte qui ne
   * défile pas, la respiration dans celle qui défile, et un quai sans marge
   * négative rendu seulement quand il a quelque chose à montrer.
   */
  it('ne met aucune gouttière sur `.bolt-project-agent-scroll`, qui ne défile pas', () => {
    const scroll = bloc(source, '.bolt-responsive-ide-mobile .bolt-project-agent-scroll {');
    const padding = /padding:\s*calc\(([^;]+?)\)\s*0\s+(calc\([^;]+\)|0) !important/.exec(scroll);

    expect(padding, 'le rembourrage est un calc() qui ne porte que les réserves conditionnelles').toBeTruthy();
    expect(padding![1]).not.toContain('--vc-mobile-panel-gutter');
    expect(padding![1]).toContain('--vc-mobile-agent-context-height');

    /*
     * RP-CKPT-01 — le bas de la boîte réserve EXACTEMENT le soulèvement du
     * composeur collant (`--mobile-nav-height + 8px`), sinon le pied du
     * dernier message passe dessous (mesuré : 677 pour un composeur à 642).
     */
    expect(padding![2]).toBe('calc(var(--mobile-nav-height) + 8px)');

    /*
     * Et le composeur collant ne porte PLUS ce soulèvement : son rectangle de
     * collage est la boîte de contenu du conteneur ; à 80 des deux côtés, il
     * remontait de 80 de trop et recouvrait encore la boîte (mesuré : 562
     * pour une boîte finissant à 642).
     */
    const composeur = bloc(
      source,
      ".bolt-responsive-ide-mobile[data-mobile-panel='chat'] .bolt-project-agent-composer {",
    );

    expect(composeur).toContain('bottom: 0 !important;');
    expect(composeur).not.toContain('bottom: calc(');

    /*
     * Et la pastille « descendre », collante dans la boîte qui défile, n'a plus
     * rien à compenser non plus : 2 px au-dessus du bas de la boîte. Avec
     * l'ancien `barre + 8 + 2`, elle flottait à 82 px du composeur (E2E).
     */
    const pastille = bloc(
      source,
      ".bolt-responsive-ide-mobile[data-mobile-panel='chat'] .bolt-agent-scroll-to-bottom,",
    );

    expect(pastille).toContain('bottom: 2px;');
    expect(pastille).not.toContain('bottom: calc(var(--mobile-nav-height)');
    expect(source).toContain(
      "html[data-vc-clavier='ouvert'] .bolt-responsive-ide-mobile[data-mobile-panel='chat'] .bolt-project-agent-scroll {\n    padding-bottom: 0 !important;",
    );
  });

  it('met la respiration sous l’en-tête dans le transcript, qui défile avec elle', () => {
    const transcript = bloc(source, '.bolt-responsive-ide-mobile .bolt-project-agent-transcript {');
    const valeur = /padding-top:\s*([0-9]+)px/.exec(transcript)?.[1];

    expect(valeur).toBeDefined();
    expect(Number(valeur)).toBeGreaterThanOrEqual(4);
    expect(Number(valeur)).toBeLessThanOrEqual(8);

    const quai = bloc(source, '.bolt-responsive-ide-mobile .bolt-agent-statusline-dock {');

    expect(quai, 'le quai remonte exactement de la respiration, jamais plus').toContain(`margin-top: -${valeur}px`);
  });

  it('ne rend le quai de la ligne d’état que s’il a quelque chose à montrer, sans marge négative', () => {
    const baseChat = readFileSync(new URL('../components/chat/BaseChat.tsx', import.meta.url).pathname, 'utf8');

    expect(baseChat).toContain('{progressAnnotations.length > 0 && (');
    expect(baseChat).not.toContain('{progressAnnotations && (');
    expect(baseChat).toContain('className="bolt-agent-statusline-dock sticky top-0 z-10"');
    expect(baseChat).not.toMatch(/bolt-agent-statusline-dock[^"]*-mt-/);
  });

  it('laisse `scroll-padding-bottom` faire l’ancrage du défilement', () => {
    /*
     * Distinction volontaire : `scroll-padding-bottom` ne décale que la cible du
     * défilement, il n'ajoute pas de boîte vide dans la mise en page. C'est bien
     * le `padding-bottom` qui devait partir, pas lui.
     */
    const scroll = bloc(source, '.bolt-responsive-ide-mobile .bolt-project-agent-scroll {');

    expect(scroll).toContain('scroll-padding-bottom');
  });
});
