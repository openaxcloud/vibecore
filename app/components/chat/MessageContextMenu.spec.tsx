/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MenuContextuel, useMenuContextuelDeMessage } from './MessageContextMenu';
import { DELAI_APPUI_LONG_MS, TOLERANCE_DEPLACEMENT_PX } from './message-context-menu';

afterEach(cleanup);

function Bulle() {
  const menu = useMenuContextuelDeMessage();

  return (
    <div>
      <div data-testid="bulle" {...menu.gestes}>
        Réponse de l’agent
      </div>
      <MenuContextuel ouvert={menu.ouvert} position={menu.position} fermer={menu.fermer} etiquette="Actions">
        <button type="button">Copier</button>
      </MenuContextuel>
    </div>
  );
}

/*
 * jsdom n'implémente pas `PointerEvent` : `fireEvent.pointerDown` retombe alors
 * sur un événement générique où `pointerType` n'existe pas, et le gestionnaire
 * n'arme jamais l'appui long. Un test écrit ainsi serait vert « par absence » —
 * exactement comme les deux tests de NON-ouverture ci-dessous le seraient si le
 * menu ne s'ouvrait jamais. On construit donc l'événement et on lui pose les
 * champs que le produit lit vraiment.
 */
function envoyerPointeur(
  element: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  options: Partial<{ pointerType: string; button: number; isPrimary: boolean; clientX: number; clientY: number }> = {},
) {
  const evenement = new Event(type, { bubbles: true, cancelable: true });

  Object.assign(evenement, {
    pointerType: 'touch',
    button: 0,
    isPrimary: true,
    clientX: 100,
    clientY: 200,
    pointerId: 1,
    ...options,
  });

  fireEvent(element, evenement);
}

describe('<MenuContextuel /> sur une bulle', () => {
  it('un appui long ouvre le menu', async () => {
    vi.useFakeTimers();

    try {
      render(<Bulle />);
      expect(screen.queryByRole('menu')).toBeNull();

      envoyerPointeur(screen.getByTestId('bulle'), 'pointerdown');
      await act(async () => {
        vi.advanceTimersByTime(DELAI_APPUI_LONG_MS);
      });

      expect(screen.getByRole('menu'), 'le menu doit s’ouvrir après un appui long').toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('un appui bref n’ouvre rien', async () => {
    vi.useFakeTimers();

    try {
      render(<Bulle />);

      const bulle = screen.getByTestId('bulle');
      envoyerPointeur(bulle, 'pointerdown');
      await act(async () => {
        vi.advanceTimersByTime(DELAI_APPUI_LONG_MS - 50);
      });
      envoyerPointeur(bulle, 'pointerup');
      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      expect(screen.queryByRole('menu'), 'un simple appui ne doit pas ouvrir le menu').toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('faire défiler le fil n’ouvre pas le menu', async () => {
    /*
     * Le défaut qu'on évite : un doigt qui glisse pour lire la conversation
     * déclencherait le menu à chaque message traversé.
     */
    vi.useFakeTimers();

    try {
      render(<Bulle />);

      const bulle = screen.getByTestId('bulle');
      envoyerPointeur(bulle, 'pointerdown');
      envoyerPointeur(bulle, 'pointermove', { clientY: 200 + TOLERANCE_DEPLACEMENT_PX + 5 });
      await act(async () => {
        vi.advanceTimersByTime(DELAI_APPUI_LONG_MS + 100);
      });

      expect(screen.queryByRole('menu')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('le clic droit ouvre le menu immédiatement, sans appui long', () => {
    render(<Bulle />);
    fireEvent.contextMenu(screen.getByTestId('bulle'), { clientX: 40, clientY: 60 });

    expect(screen.getByRole('menu'), 'le clic droit doit ouvrir tout de suite').toBeTruthy();
  });

  it('la souris n’ouvre PAS le menu par un appui maintenu', async () => {
    /*
     * Elle a le clic droit. Lui imposer un appui long ferait du maintien d'un
     * bouton un geste ambigu — et casserait la sélection de texte à la souris.
     */
    vi.useFakeTimers();

    try {
      render(<Bulle />);
      envoyerPointeur(screen.getByTestId('bulle'), 'pointerdown', { pointerType: 'mouse' });
      await act(async () => {
        vi.advanceTimersByTime(DELAI_APPUI_LONG_MS + 100);
      });

      expect(screen.queryByRole('menu')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Échap referme le menu', () => {
    render(<Bulle />);
    fireEvent.contextMenu(screen.getByTestId('bulle'), { clientX: 40, clientY: 60 });
    expect(screen.getByRole('menu')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('menu'), 'le menu doit se refermer').toBeNull();
  });
});
