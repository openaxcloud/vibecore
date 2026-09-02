import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  DELAI_APPUI_LONG_MS,
  fautIlArmerLAppuiLong,
  leDeplacementAnnuleLAppui,
  placerLeMenu,
  type AppuiEnCours,
} from './message-context-menu';

export interface MenuContextuelDeMessage {
  /** À étaler sur la bulle : ce sont ces gestes qui ouvrent le menu. */
  gestes: {
    onPointerDown: (evenement: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (evenement: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    onContextMenu: (evenement: { preventDefault: () => void; clientX: number; clientY: number }) => void;
  };
  ouvert: boolean;
  position: { x: number; y: number };
  fermer: () => void;
}

/**
 * Appui long au doigt, clic droit à la souris — un seul menu pour les deux.
 *
 * Le geste s'attache aux événements de POINTEUR et non au focus : Safari iOS ne
 * focalise pas un conteneur non interactif, et la bulle d'un message n'en est
 * pas un. C'est le piège qui a déjà coûté une révélation d'actions au toucher
 * dans ce produit.
 */
export function useMenuContextuelDeMessage(): MenuContextuelDeMessage {
  const [ouvert, setOuvert] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const appui = useRef<AppuiEnCours | null>(null);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);

  const annuler = useCallback(() => {
    if (minuterie.current) {
      clearTimeout(minuterie.current);
      minuterie.current = null;
    }

    appui.current = null;
  }, []);

  useEffect(() => annuler, [annuler]);

  const ouvrirEn = useCallback((x: number, y: number) => {
    /*
     * La taille réelle du menu n'est connue qu'après le rendu ; on place sur une
     * estimation, puis la feuille de style borne le reste (`max-height`,
     * `overflow`). L'important est de ne jamais ouvrir hors écran.
     */
    setPosition(
      placerLeMenu(
        { x, y },
        { largeur: 232, hauteur: 260 },
        { largeur: window.innerWidth, hauteur: window.innerHeight },
      ),
    );
    setOuvert(true);
  }, []);

  const onPointerDown = useCallback(
    (evenement: ReactPointerEvent<HTMLElement>) => {
      if (!fautIlArmerLAppuiLong(evenement)) {
        return;
      }

      appui.current = { x: evenement.clientX, y: evenement.clientY, pointerId: evenement.pointerId };

      const { clientX, clientY } = evenement;

      minuterie.current = setTimeout(() => {
        if (appui.current) {
          ouvrirEn(clientX, clientY);
        }

        annuler();
      }, DELAI_APPUI_LONG_MS);
    },
    [annuler, ouvrirEn],
  );

  const onPointerMove = useCallback(
    (evenement: ReactPointerEvent<HTMLElement>) => {
      if (appui.current && leDeplacementAnnuleLAppui(appui.current, evenement.clientX, evenement.clientY)) {
        annuler();
      }
    },
    [annuler],
  );

  const onContextMenu = useCallback(
    (evenement: { preventDefault: () => void; clientX: number; clientY: number }) => {
      evenement.preventDefault();
      ouvrirEn(evenement.clientX, evenement.clientY);
    },
    [ouvrirEn],
  );

  return {
    gestes: { onPointerDown, onPointerMove, onPointerUp: annuler, onPointerCancel: annuler, onContextMenu },
    ouvert,
    position,
    fermer: useCallback(() => setOuvert(false), []),
  };
}

export function MenuContextuel({
  ouvert,
  position,
  fermer,
  etiquette,
  children,
}: {
  ouvert: boolean;
  position: { x: number; y: number };
  fermer: () => void;
  etiquette: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!ouvert) {
      return undefined;
    }

    const surEchappement = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape') {
        fermer();
      }
    };

    window.addEventListener('keydown', surEchappement);

    return () => window.removeEventListener('keydown', surEchappement);
  }, [fermer, ouvert]);

  if (!ouvert) {
    return null;
  }

  return (
    <>
      {/*
       * Le voile ferme le menu au premier geste ailleurs. Il est sous le menu,
       * jamais au-dessus : un voile qui intercepte les appuis DU menu rendrait
       * ses entrées inertes, exactement le défaut qu'on corrige ici.
       */}
      <div className="bolt-message-context-menu-veil" onPointerDown={fermer} aria-hidden />
      <div
        className="bolt-message-context-menu"
        role="menu"
        aria-label={etiquette}
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
      >
        {children}
      </div>
    </>
  );
}
