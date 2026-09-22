/**
 * @vitest-environment jsdom
 */

/*
 * Une boîte de taille FIXE dans une rangée flexible doit porter `shrink-0`.
 *
 * Mesuré le 2026-09-16 sur la production, à 390 px : la case à cocher de
 * « High effort » déclare `h-4 w-4` — 16 × 16 px — et rendait **7,6 × 14 px**.
 * Rien ne l'empêchait de rétrécir : dans une rangée `flex justify-between`, un
 * enfant sans `shrink-0` cède sa largeur au texte voisin dès que la place
 * manque. À la largeur d'Avi, la case devenait un fil vertical — visible sur
 * /Users/hb/captures-vibecore/424-06-ecart-harnais-production.png.
 *
 * Cette garde vise la RÈGLE, pas l'occurrence (règle 7 de CLAUDE.md) : tout
 * élément du panneau qui déclare une largeur fixe par une classe utilitaire
 * `w-<n>` doit aussi déclarer `shrink-0` (ou `flex-none`). Une case ajoutée
 * demain sans cette protection rougira ici.
 *
 * Elle est volontairement ANCRÉE SUR LES CLASSES et non sur des pixels : jsdom
 * n'a pas de moteur de mise en page, `getBoundingClientRect` y rend 0 partout.
 * La mesure en pixels réels est tenue par
 * tests/e2e/agent-composer-panel-viewport.spec.ts, qui tourne sur WebKit iPhone.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentPowerControls, type AgentBuildTier, type AgentPowerControlsValue } from './AgentPowerControls';

vi.mock('remix-utils/client-only', () => ({
  ClientOnly: ({ children }: { children: () => React.ReactNode }) => <>{children()}</>,
}));

afterEach(cleanup);

const LARGEUR_FIXE = /(^|\s)w-\d+(\s|$)/;
const NE_RETRECIT_PAS = /(^|\s)(shrink-0|flex-none)(\s|$)/;

function valeur(mode: AgentBuildTier): AgentPowerControlsValue {
  return { highEffort: false, highPowerModel: false, extendedThinking: false, turboMode: false, buildTier: mode };
}

/** Rend le panneau ouvert et rend ses deux interrupteurs de réglage. */
function interrupteurs(mode: AgentBuildTier, disponible: boolean) {
  render(
    <AgentPowerControls
      value={valeur(mode)}
      onChange={() => {}}
      availability={{
        modes: (['lite', 'economy', 'power'] as AgentBuildTier[]).map((m) => ({ mode: m, available: true })),
        highEffort: { available: disponible },
        turbo: { available: disponible, planAllowed: disponible, orgEnabled: disponible },
      }}
      variant="compact"
    />,
  );
  fireEvent.click(screen.getByTestId('agent-mode-advanced'));

  const panneau = document.querySelector('[role="dialog"]');
  expect(panneau, 'le panneau ne s’est pas ouvert — la garde ne mesurerait rien').not.toBeNull();

  /*
   * Les interrupteurs vivent sur le SECOND écran de la feuille depuis qu'elle est
   * montée (structure à deux écrans, décision d'Avi). En Lite, l'entrée est
   * verrouillée : on la clique quand même, `disabled` rend le clic sans effet, et
   * l'assertion « au moins deux interrupteurs » ci-dessous dit alors clairement
   * que la garde ne mesure rien — c'est ce qu'on veut, pas un vert silencieux.
   */
  const entree = screen.queryByTestId('feuille-entree-avance');

  if (entree) {
    fireEvent.click(entree);
  }

  return [...panneau!.querySelectorAll<HTMLElement>('[data-testid^="agent-switch-"]')];
}

describe('les boîtes à largeur fixe du panneau ne peuvent pas être écrasées', () => {
  /*
   * Les deux axes qui changent ce qui est rendu à droite de chaque rangée : le
   * mode décide de l'état des réglages, et la disponibilité décide entre la
   * case à cocher et la pastille « PRO » / « ORG ». Les six combinaisons sont
   * couvertes, et les deux formes doivent résister à l'écrasement.
   */
  /*
   * ⚠️ `economy` et `power` ont été renommés en `power` et `max`. L'ancienne
   * liste de cette boucle portait encore `economy` : un mode qui n'existe plus,
   * et que `tsc` n'a jamais signalé parce que `tsconfig.web.json` exclut les
   * specs (voir docs/bugs/BUG-TYPE-CI-001.md). La boucle tournait donc sur un
   * cas mort en croyant couvrir trois modes.
   */
  for (const mode of ['lite', 'power', 'max'] as AgentBuildTier[]) {
    for (const disponible of [true, false]) {
      it(`mode ${mode}, réglages ${disponible ? 'ouverts' : 'verrouillés'}`, () => {
        const rangees = interrupteurs(mode, disponible);

        /*
         * En Lite, l'entrée « avancé » est VERROUILLÉE : il n'y a aucun
         * interrupteur à mesurer, et c'est le comportement voulu. On vérifie
         * alors le verrou lui-même plutôt que de rendre vert sans rien mesurer.
         */
        if (mode === 'lite') {
          const entree = screen.getByTestId('feuille-entree-avance');
          expect(entree.getAttribute('data-verrouillee')).toBe('true');
          expect((entree as HTMLButtonElement).disabled).toBe(true);
          expect(rangees.length, 'aucun interrupteur ne doit être atteignable en Lite').toBe(0);

          return;
        }

        // Contrôle positif : sans interrupteur trouvé, l'assertion ne prouve rien.
        expect(rangees.length, 'aucun interrupteur trouvé — sélecteur à revoir').toBe(2);

        const fautives = rangees
          .map((rangee) => rangee.lastElementChild as HTMLElement | null)
          .filter((fin): fin is HTMLElement => fin !== null)
          .filter((fin) => !NE_RETRECIT_PAS.test(fin.className || ''))
          .map((fin) => (fin.className || '(sans classe)').trim().slice(0, 90));

        expect(fautives, `en bout de rangée flexible sans shrink-0 : ${fautives.join(' | ')}`).toEqual([]);
      });
    }
  }

  /*
   * Le balayage général, en plus des bouts de rangée : toute largeur fixe
   * déclarée dans le panneau, où qu'elle soit, doit être protégée.
   */
  it('toute largeur fixe déclarée dans le panneau porte shrink-0', () => {
    const panneau = (() => {
      interrupteurs('max', true);
      return document.querySelector('[role="dialog"]')!;
    })();

    const boites = [...panneau.querySelectorAll<HTMLElement>('*')].filter((el) =>
      LARGEUR_FIXE.test(el.className || ''),
    );

    expect(boites.length, 'aucune largeur fixe trouvée — sélecteur à revoir').toBeGreaterThan(0);

    const fautives = boites
      .filter((el) => !NE_RETRECIT_PAS.test(el.className))
      .map((el) => el.className.trim().slice(0, 90));

    expect(fautives, `largeurs fixes sans shrink-0 : ${fautives.join(' | ')}`).toEqual([]);
  });
});
