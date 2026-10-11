/**
 * @vitest-environment jsdom
 */

/*
 * Le panneau ne se rend JAMAIS dans la chaîne d'ancêtres du composeur.
 *
 * Régression mesurée en production le 2026-09-22, à 1440×900, sur `4ef1d2c17e` :
 *
 *     panneau : 216×448, opacity 1, visibility visible, z-index 50
 *     elementFromPoint en son centre → un noeud du FIL, hors du panneau
 *     ancêtre fautif : .bolt-chatbox-toolbar-primary  overflow: hidden
 *
 * Le panneau existait et était « visible » au sens du style ; il était ROGNÉ par
 * un ancêtre. Sur bureau, plus aucun changement de mode n'était possible.
 *
 * Sur téléphone le remède existait déjà — porter à la racine du gabarit mobile.
 * Sur bureau, il n'y avait pas de portail du tout : `porterSurTelephone` rendait
 * le panneau EN PLACE quand aucune racine mobile n'était trouvée, c'est-à-dire
 * exactement dans l'ancêtre qui le rogne.
 *
 * Cette garde n'essaie pas de mesurer un rognage en jsdom — jsdom ne met rien en
 * page. Elle tient la seule chose qui compte et qui se vérifie : le panneau est
 * porté HORS du composeur, dans les deux cas.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AgentPowerControls, type AgentPowerControlsValue } from './AgentPowerControls';
import { SELECTEUR_RACINE_MOBILE } from './feuille-mobile';

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

const VALEUR: AgentPowerControlsValue = {
  highEffort: false,
  highPowerModel: false,
  extendedThinking: false,
  turboMode: false,
  buildTier: 'max',
};

function poser() {
  const { container } = render(
    <div className="bolt-chatbox-toolbar-primary" style={{ overflow: 'hidden' }}>
      <AgentPowerControls value={VALEUR} onChange={() => {}} variant="compact" estimatedCents={12} />
    </div>,
  );

  fireEvent.click(screen.getByTestId('agent-mode-advanced'));

  return container;
}

describe('le panneau est porté hors de la chaîne qui le rogne', () => {
  it('sans gabarit mobile — bureau — il n’est PAS un descendant du composeur', () => {
    const composeur = poser();
    const panneau = document.querySelector('[role="dialog"]');

    expect(panneau, 'le panneau ne s’est pas ouvert — la garde ne mesurerait rien').not.toBeNull();
    expect(composeur.contains(panneau!), 'le panneau est rendu DANS le composeur : il sera rogné').toBe(false);
  });

  it('sans gabarit mobile, il est porté à document.body', () => {
    poser();

    const panneau = document.querySelector('[role="dialog"]')!;
    expect(panneau.parentElement).toBe(document.body);
  });

  it('avec un gabarit mobile, il est porté à la racine mobile', () => {
    const racine = document.createElement('div');
    racine.className = SELECTEUR_RACINE_MOBILE.slice(1);
    document.body.append(racine);

    const composeur = poser();
    const panneau = document.querySelector('[role="dialog"]')!;

    expect(composeur.contains(panneau)).toBe(false);
    expect(racine.contains(panneau), 'le panneau devrait vivre dans la racine mobile').toBe(true);

    racine.remove();
  });

  it('sur bureau le panneau porte son propre plan, pas z-index 50 dans le composeur', () => {
    poser();

    const panneau = document.querySelector('[role="dialog"]')!;
    expect(panneau.className).toContain('bolt-agent-power-popover-flottant');
    expect((panneau as HTMLElement).style.position).toBe('fixed');
  });
});
