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
