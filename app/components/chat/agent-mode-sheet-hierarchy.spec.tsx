/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentPowerControls, type AgentPowerControlsValue } from './AgentPowerControls';

afterEach(cleanup);

const valeur: AgentPowerControlsValue = {
  highEffort: false,
  highPowerModel: false,
  extendedThinking: false,
  turboMode: false,
  buildTier: 'economy',
};

function monter(options: { verrouillerPuissance?: boolean } = {}) {
  return render(
    <AgentPowerControls
      value={valeur}
      onChange={vi.fn()}
      variant="compact"
      availability={
        options.verrouillerPuissance ? { modes: [{ mode: 'power', available: false, reason: 'plan' }] } : undefined
      }
    />,
  );
}

function ouvrirLaFeuille(options: { verrouillerPuissance?: boolean } = {}) {
  monter(options);
  fireEvent.click(screen.getByTestId('agent-mode-advanced'));

  return screen.getByRole('dialog');
}

describe('feuille des modes de l’agent — deux niveaux', () => {
  it('s’ouvre sur la LISTE DES MODES, pas sur les réglages', () => {
    /*
     * Référence Replit, captures d'Avi : « Agent modes » d'abord ; les réglages
     * du mode choisi viennent ensuite, sur place.
     */
    const feuille = ouvrirLaFeuille();

    expect(within(feuille).getAllByRole('radio').length, 'les trois modes sont listés').toBe(3);
    expect(screen.queryByRole('switch', { name: /Effort|effort/i }), 'les réglages ne sont pas encore là').toBeNull();
  });

  it('choisir un mode navigue SUR PLACE vers ses réglages', () => {
    const feuille = ouvrirLaFeuille();
    fireEvent.click(within(feuille).getAllByRole('radio')[1]);

    expect(screen.getByRole('switch', { name: /effort/i }), 'les réglages du mode sont affichés').toBeTruthy();
    expect(screen.getAllByRole('dialog').length, 'une seule surface, jamais une pile').toBe(1);
  });

  it('le chevron de retour ramène à la liste', () => {
    const feuille = ouvrirLaFeuille();
    fireEvent.click(within(feuille).getAllByRole('radio')[1]);
    fireEvent.click(screen.getByRole('button', { name: /Revenir aux modes|Back to modes/i }));

    expect(within(screen.getByRole('dialog')).getAllByRole('radio').length).toBe(3);
    expect(screen.queryByRole('switch', { name: /effort/i })).toBeNull();
  });

  it('refermer puis rouvrir repart de la liste, jamais d’un sous-écran', () => {
    const feuille = ouvrirLaFeuille();
    fireEvent.click(within(feuille).getAllByRole('radio')[1]);
    fireEvent.click(screen.getByTestId('agent-mode-advanced'));
    fireEvent.click(screen.getByTestId('agent-mode-advanced'));

    const rouverte = screen.getByRole('dialog');

    expect(within(rouverte).getAllByRole('radio').length).toBe(3);
  });

  it('une entrée verrouillée reste LISIBLE et porte un cadenas', () => {
    /*
     * La référence ne masque pas ce qui est indisponible : elle le montre avec
     * un cadenas discret. On doit pouvoir voir ce qu'on n'a pas — et lire ce
     * que ça fait avant de décider de le payer.
     */
    const feuille = ouvrirLaFeuille({ verrouillerPuissance: true });
    const modes = within(feuille).getAllByRole('radio');
    const verrouille = modes.find((mode) => mode.getAttribute('data-verrouille') === 'true');

    expect(verrouille, 'le mode indisponible est présent, pas masqué').toBeTruthy();
    expect(within(verrouille!).getByLabelText(/Indisponible|Not available/i), 'il porte un cadenas').toBeTruthy();
    expect(verrouille!.textContent, 'et son libellé reste lisible').toMatch(/\S/);
  });
});

describe('curseur d’effort', () => {
  it('rend deux crans, dont un seul actif', () => {
    /*
     * La référence Replit montre un curseur de Low à Max. Notre modèle ne
     * connaît qu'un booléen : on rend fidèlement la FORME avec les deux
     * positions que le produit possède réellement, plutôt que d'inventer des
     * états dont personne n'a décidé la valeur.
     */
    const feuille = ouvrirLaFeuille();
    fireEvent.click(within(feuille).getAllByRole('radio')[1]);

    const crans = document.querySelectorAll('.bolt-agent-effort-stop');

    expect(crans.length, 'deux crans, pas un interrupteur').toBe(2);

    const actifs = [...crans].filter((cran) => cran.getAttribute('data-actif') === 'true');

    expect(actifs.length, 'un seul cran actif à la fois').toBe(1);
  });

  it('porte sa légende, pour qu’on sache ce que valent les crans', () => {
    const feuille = ouvrirLaFeuille();
    fireEvent.click(within(feuille).getAllByRole('radio')[1]);

    const legende = document.querySelector('.bolt-agent-effort-legend');

    expect(legende, 'un curseur sans légende ne dit pas ce qu’il règle').toBeTruthy();
    expect((legende!.textContent ?? '').trim().length).toBeGreaterThan(0);
  });
});
