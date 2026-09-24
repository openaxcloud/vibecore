/**
 * @vitest-environment jsdom
 */

/*
 * Bureau : les deux panneaux, côte à côte.
 *
 * D'après les captures d'Avi : le panneau des modes RESTE en place et garde son
 * contenu — sa liste, sa description, ses deux entrées — pendant que le
 * sélecteur de modèle s'ouvre à sa droite. C'est exactement ce qui le distingue
 * du téléphone, où le second écran REMPLACE le premier.
 *
 * Le seuil de bascule n'est pas inventé ici : la disposition suit le point de
 * rupture du dépôt (`TABLET_MAX_WIDTH` = 1199, donc bureau à partir de 1200),
 * celui qui décide déjà entre gabarit mobile et gabarit large.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AgentMode } from '@vibecore/billing/src/agent-routing';
import { CATALOGUE_INTEGRE } from '@vibecore/billing/src/catalogue-integre';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentPowerControls } from './AgentPowerControls';
import { FeuilleDesModes } from './FeuilleDesModes';
import { getChatControlsCopy } from '~/lib/i18n/catalogs/chat-controls';

afterEach(cleanup);

const copy = getChatControlsCopy('fr');

const LIBELLES: Record<AgentMode, { label: string; hint: string }> = {
  lite: { label: 'Lite', hint: 'Rapide et économique.' },
  power: { label: 'Power', hint: 'Le juste équilibre.' },
  max: { label: 'Max', hint: 'Pour les tâches longues.' },
};

function poser(disposition: 'feuille' | 'cote-a-cote') {
  render(
    <FeuilleDesModes
      copy={copy}
      modes={['lite', 'power', 'max']}
      modeActif="max"
      libelleDuMode={(m) => LIBELLES[m]}
      catalogues={CATALOGUE_INTEGRE}
      sondes={[]}
      choixParMode={{}}
      onChoisirMode={vi.fn()}
      onChoisirModele={vi.fn()}
      disposition={disposition}
    />,
  );
}

describe('sur bureau, le premier panneau ne disparaît pas', () => {
  it('ouvrir le sélecteur laisse les trois modes en place', () => {
    poser('cote-a-cote');

    fireEvent.click(screen.getByTestId('feuille-entree-modele'));

    for (const mode of ['lite', 'power', 'max']) {
      expect(screen.getByTestId(`feuille-mode-${mode}`)).toBeTruthy();
    }
  });

  it('le premier panneau garde AUSSI sa description et ses deux entrées', () => {
    poser('cote-a-cote');

    fireEvent.click(screen.getByTestId('feuille-entree-modele'));

    expect(screen.getByTestId('feuille-entree-modele')).toBeTruthy();
    expect(screen.getByTestId('feuille-entree-avance')).toBeTruthy();
    expect(document.body.textContent).toContain('Pour les tâches longues.');
  });

  it('le second panneau existe et porte son côté', () => {
    poser('cote-a-cote');

    fireEvent.click(screen.getByTestId('feuille-entree-modele'));

    const second = screen.getByTestId('feuille-second-panneau');
    expect(second).toBeTruthy();
    expect(['droite', 'gauche']).toContain(second.getAttribute('data-cote'));
    expect(second.querySelectorAll('[data-testid^="feuille-modele-"]').length).toBeGreaterThan(0);
  });

  it('au repos, aucun second panneau', () => {
    poser('cote-a-cote');

    expect(screen.queryByTestId('feuille-second-panneau')).toBeNull();
  });
});

describe('sur téléphone, le second écran remplace bien le premier', () => {
  it('les modes disparaissent quand le sélecteur s’ouvre', () => {
    poser('feuille');

    fireEvent.click(screen.getByTestId('feuille-entree-modele'));

    expect(screen.queryByTestId('feuille-mode-lite')).toBeNull();
    expect(screen.queryByTestId('feuille-second-panneau')).toBeNull();
    expect(screen.getByTestId('feuille-retour')).toBeTruthy();
  });
});

describe('le chevron de retour ramène aux modes, il ne referme pas tout', () => {
  /*
   * Défaut mesuré en production le 2026-09-23 sur `9ff46376ac`, sur les DEUX
   * entrées à chevron : après un clic sur le chevron de retour du second
   * panneau de bureau, `modes=0 second=0` — tout avait disparu. Sur téléphone,
   * le même geste rendait `modes=3`.
   *
   * La cause : le second panneau est porté à `document.body`, donc le
   * gestionnaire de clic extérieur d'`AgentPowerControls` le voyait comme
   * « dehors » et refermait le panneau entier. Le chevron n'a jamais eu
   * l'occasion de faire son travail.
   *
   * Cette garde part d'`AgentPowerControls`, pas de la feuille : c'est lui qui
   * porte le gestionnaire fautif, et une garde posée sur la feuille seule
   * n'aurait rien vu.
   */
  const poserComposeur = () => {
    render(
      <AgentPowerControls
        value={{
          highEffort: false,
          highPowerModel: false,
          extendedThinking: false,
          turboMode: false,
          buildTier: 'max',
        }}
        onChange={() => undefined}
        variant="compact"
        estimatedCents={12}
      />,
    );

    fireEvent.click(screen.getByTestId('agent-mode-advanced'));
  };

  for (const entree of ['modele', 'avance'] as const) {
    it(`depuis « ${entree} », le chevron rend la liste des modes`, () => {
      poserComposeur();

      fireEvent.click(screen.getByTestId(`feuille-entree-${entree}`));
      expect(screen.getByTestId('feuille-second-panneau'), 'le second panneau ne s’est pas ouvert').toBeTruthy();

      const chevron = screen.getByTestId('feuille-retour');
      fireEvent.pointerDown(chevron);
      fireEvent.click(chevron);

      expect(screen.queryByTestId('feuille-second-panneau'), 'le second panneau devrait être refermé').toBeNull();
      expect(screen.getAllByTestId(/^feuille-mode-/).length, 'la liste des modes doit rester').toBe(3);
    });
  }
});
