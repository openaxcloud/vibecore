/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MenuContextuel, useMenuContextuelDeMessage } from './MessageContextMenu';

import { DELAI_APPUI_LONG_MS, TOLERANCE_DEPLACEMENT_PX, menuDeMessageOuvert } from './message-context-menu';

afterEach(() => {
  cleanup();
  menuDeMessageOuvert.set(null);
});

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

  it('sur téléphone, le menu se rend à la racine du gabarit mobile, hors de la bulle', async () => {
    /*
     * Avi, 07/09 08:03 : sur le dernier message, le menu passait sous la zone
     * de saisie. Rendu dans la bulle, il restait dans le contexte d'empilement
     * du fil, derrière le composeur collant. À la racine mobile, son z-index
     * vaut pour tout l'écran — comme les feuilles du composeur.
     */
    render(
      <div className="bolt-responsive-ide-mobile" data-testid="racine-mobile">
        <Bulle />
      </div>,
    );

    const bulle = screen.getByTestId('bulle');

    envoyerPointeur(bulle, 'pointerdown');

    await act(async () => {
      await new Promise((resoudre) => setTimeout(resoudre, DELAI_APPUI_LONG_MS + 50));
    });

    const menu = screen.getByRole('menu');

    expect(menu.parentElement).toBe(screen.getByTestId('racine-mobile'));
    expect(bulle.parentElement?.contains(menu)).toBe(false);
  });

  it('Échap referme le menu', () => {
    render(<Bulle />);
    fireEvent.contextMenu(screen.getByTestId('bulle'), { clientX: 40, clientY: 60 });
    expect(screen.getByRole('menu')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('menu'), 'le menu doit se refermer').toBeNull();
  });
});

function DeuxBulles() {
  const premier = useMenuContextuelDeMessage('user:1');
  const second = useMenuContextuelDeMessage('assistant:2');

  return (
    <div>
      <div data-testid="bulle-1" {...premier.gestes}>
        Première
      </div>
      <MenuContextuel ouvert={premier.ouvert} position={premier.position} fermer={premier.fermer} etiquette="Un">
        <button type="button">Modifier</button>
      </MenuContextuel>
      <div data-testid="bulle-2" {...second.gestes}>
        Seconde
      </div>
      <MenuContextuel ouvert={second.ouvert} position={second.position} fermer={second.fermer} etiquette="Deux">
        <button type="button">Copier</button>
      </MenuContextuel>
    </div>
  );
}

describe('BUG-MESSAGE-MENU-IOS-001 — un seul menu à la fois, fermé au défilement, ancré à la ligne', () => {
  /*
   * Captures d'Avi, 08/09 07:47 : la barre de l'agent ET le rond « Modifier »
   * du message utilisateur flottaient ensemble ; « jamais l'icône disparaît ».
   */
  it('ouvrir le menu d’un second message ferme celui du premier', async () => {
    vi.useFakeTimers();

    try {
      render(<DeuxBulles />);
      envoyerPointeur(screen.getByTestId('bulle-1'), 'pointerdown');
      await act(async () => {
        vi.advanceTimersByTime(DELAI_APPUI_LONG_MS + 10);
      });
      expect(screen.getAllByRole('menu')).toHaveLength(1);
      expect(screen.getByRole('menu').getAttribute('aria-label')).toBe('Un');

      envoyerPointeur(screen.getByTestId('bulle-2'), 'pointerdown');
      await act(async () => {
        vi.advanceTimersByTime(DELAI_APPUI_LONG_MS + 10);
      });
      expect(screen.getAllByRole('menu')).toHaveLength(1);
      expect(screen.getByRole('menu').getAttribute('aria-label')).toBe('Deux');
    } finally {
      vi.useRealTimers();
    }
  });

  it('un défilement ferme le menu ; un appui dans le menu ne le ferme pas', async () => {
    vi.useFakeTimers();

    try {
      render(<Bulle />);
      envoyerPointeur(screen.getByTestId('bulle'), 'pointerdown');
      await act(async () => {
        vi.advanceTimersByTime(DELAI_APPUI_LONG_MS + 10);
      });
      expect(screen.getByRole('menu')).toBeTruthy();

      await act(async () => {
        envoyerPointeur(screen.getByRole('button', { name: 'Copier' }), 'pointerdown');
      });
      expect(screen.queryByRole('menu')).not.toBeNull();

      await act(async () => {
        document.body.dispatchEvent(new Event('scroll', { bubbles: true }));
      });
      expect(screen.queryByRole('menu')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('câblage : identifiants par message, pas de sélection native sur les lignes en mobile', () => {
    const lire = (chemin: string) => readFileSync(new URL(chemin, import.meta.url).pathname, 'utf8');

    expect(lire('./AssistantMessage.tsx')).toContain(
      'useMenuContextuelDeMessage(messageId ? `assistant:${messageId}` : undefined)',
    );
    expect(lire('./UserMessage.tsx')).toContain(
      'useMenuContextuelDeMessage(messageId ? `user:${messageId}` : undefined)',
    );

    const feuille = lire('../../styles/index.scss');
    const debut = feuille.indexOf('.bolt-responsive-ide-mobile .bolt-chat-message-row {');

    expect(debut).toBeGreaterThan(-1);
    expect(feuille.slice(debut, feuille.indexOf('}', debut))).toContain('-webkit-touch-callout: none;');
    expect(feuille.slice(debut, feuille.indexOf('}', debut))).toContain('user-select: none;');

    // La barre est centrée sur le centre de la ligne par transformation, pas depuis une largeur mesurée trop tôt.
    const centre = feuille.indexOf(".bolt-responsive-ide-mobile .bolt-message-context-menu[data-centre='true'] {");

    expect(centre).toBeGreaterThan(-1);
    expect(feuille.slice(centre, feuille.indexOf('}', centre))).toContain('transform: translateX(-50%);');
    expect(lire('./MessageContextMenu.tsx')).toContain("data-centre={racineMobile ? 'true' : undefined}");
  });
});
