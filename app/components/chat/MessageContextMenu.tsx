import { useStore } from '@nanostores/react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cibleFeuilleMobile } from './feuille-mobile';
import {
  DELAI_APPUI_LONG_MS,
  fautIlArmerLAppuiLong,
  leDeplacementAnnuleLAppui,
  menuDeMessageOuvert,
  placerLaBarre,
  placerLeMenu,
  pointDOuverture,
  ramenerDansLEcran,
  type AppuiEnCours,
} from './message-context-menu';

export interface MenuContextuelDeMessage {
  /**
   * À poser sur l'élément qui rend le message. Le geste est ensuite écouté sur
   * la LIGNE entière (`.bolt-chat-message-row`), pas seulement sur la bulle.
   */
  ancre: RefObject<HTMLElement | null>;

  /** À poser sur la ligne : Entrée, Espace et Maj+F10 ouvrent le menu. */
  onKeyDown: (evenement: ReactKeyboardEvent<HTMLElement>) => void;

  /** Ouverture explicite, pour une cible visible qui n'est ni un geste ni une touche. */
  ouvrirEn: (x: number, y: number) => void;

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
export function useMenuContextuelDeMessage(identifiant?: string): MenuContextuelDeMessage {
  /*
   * BUG-MESSAGE-MENU-IOS-001 — l'état « ouvert » vit dans un magasin partagé,
   * clé par message : un seul menu à la fois dans tout le fil. Sans
   * identifiant fourni (tests, messages sans id), l'instance reçoit le sien.
   */
  const identifiantInterne = useId();
  const id = identifiant ?? identifiantInterne;
  const ouvertPour = useStore(menuDeMessageOuvert);
  const ouvert = ouvertPour === id;
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const appui = useRef<AppuiEnCours | null>(null);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ancre = useRef<HTMLElement | null>(null);

  const annuler = useCallback(() => {
    if (minuterie.current) {
      clearTimeout(minuterie.current);
      minuterie.current = null;
    }

    appui.current = null;
  }, []);

  useEffect(() => annuler, [annuler]);

  const ouvrirEn = useCallback(
    (x: number, y: number) => {
      /*
       * La taille réelle du menu n'est connue qu'après le rendu ; on place sur une
       * estimation, puis la feuille de style borne le reste (`max-height`,
       * `overflow`). L'important est de ne jamais ouvrir hors écran.
       */
      /*
       * SUR TÉLÉPHONE, le point est gardé BRUT : c'est le centre de la ligne,
       * et la barre se centre dessus par transformation. L'estimation de
       * bureau (232 px) le rabattait à 168 sur un écran de 412 — la barre
       * finissait 38 px à gauche du centre (mesuré le 08/09).
       */
      setPosition(
        typeof document !== 'undefined' && cibleFeuilleMobile(document)
          ? { x: Math.round(x), y: Math.round(y) }
          : placerLeMenu(
              { x, y },
              { largeur: 232, hauteur: 260 },
              { largeur: window.innerWidth, hauteur: window.innerHeight },
            ),
      );
      menuDeMessageOuvert.set(id);
    },
    [id],
  );

  /*
   * Au doigt, le menu s'ouvre AU-DESSUS DE LA LIGNE du message, centré — le
   * même endroit pour chaque message —, jamais sous le doigt (BUG-MESSAGE-MENU-
   * IOS-001). À la souris (clic droit), sous le pointeur.
   */
  const ouvrirDepuisLaLigne = useCallback(
    (ligne: Element | null | undefined, pointeur: { x: number; y: number }) => {
      const surTelephone = typeof document !== 'undefined' && Boolean(cibleFeuilleMobile(document));
      const boite = ligne?.getBoundingClientRect();
      const point = pointDOuverture(boite ?? null, pointeur, surTelephone);

      ouvrirEn(point.x, point.y);
    },
    [ouvrirEn],
  );

  const onPointerDown = useCallback(
    (evenement: ReactPointerEvent<HTMLElement>) => {
      if (!fautIlArmerLAppuiLong(evenement)) {
        return;
      }

      appui.current = { x: evenement.clientX, y: evenement.clientY, pointerId: evenement.pointerId };

      const { clientX, clientY } = evenement;
      const ligne = (evenement.currentTarget as HTMLElement | null)?.closest('.bolt-chat-message-row');

      minuterie.current = setTimeout(() => {
        if (appui.current) {
          ouvrirDepuisLaLigne(ligne, { x: clientX, y: clientY });
        }

        annuler();
      }, DELAI_APPUI_LONG_MS);
    },
    [annuler, ouvrirDepuisLaLigne],
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

  /*
   * LA LIGNE ENTIERE, pas seulement la bulle.
   *
   * Les gestes React ci-dessus sont poses sur l'element du message. Ils
   * fonctionnent quand le doigt touche la bulle — l'evenement remonte. Mais la
   * LIGNE (`.bolt-chat-message-row`) est plus large : elle porte la gouttiere et
   * l'avatar, et c'est elle que l'utilisateur vise quand il appuie a cote du
   * texte. Un appui long y tombait dans le vide.
   *
   * Mesure du 2026-09-05 : le test envoie son `pointerdown` sur la ligne, et
   * rien ne se passait — un evenement dispatche sur un parent ne descend pas
   * vers ses enfants. Le test avait raison de rougir : la zone de geste etait
   * plus etroite que la surface que l'utilisateur voit et vise.
   *
   * On ecoute donc en NATIF sur la ligne, en plus des props React. Les deux
   * chemins appellent le meme code ; le premier des deux qui arrive arme
   * l'appui, et `annuler` est idempotent.
   */
  useEffect(() => {
    const element = ancre.current;
    const ligne = element?.closest('.bolt-chat-message-row');

    if (!ligne) {
      return undefined;
    }

    const surPointerDown = (evenement: Event) => {
      const pointeur = evenement as globalThis.PointerEvent;

      if (!fautIlArmerLAppuiLong(pointeur)) {
        return;
      }

      annuler();

      const { clientX, clientY } = pointeur;
      appui.current = { x: clientX, y: clientY, pointerId: pointeur.pointerId };
      minuterie.current = setTimeout(() => {
        if (appui.current) {
          ouvrirDepuisLaLigne(ligne, { x: clientX, y: clientY });
        }

        annuler();
      }, DELAI_APPUI_LONG_MS);
    };

    const surPointerMove = (evenement: Event) => {
      const pointeur = evenement as globalThis.PointerEvent;
      const depart = appui.current;

      if (depart && leDeplacementAnnuleLAppui(depart, pointeur.clientX, pointeur.clientY)) {
        annuler();
      }
    };

    const surContextMenu = (evenement: Event) => {
      const souris = evenement as globalThis.MouseEvent;
      souris.preventDefault();
      ouvrirEn(souris.clientX, souris.clientY);
    };

    ligne.addEventListener('pointerdown', surPointerDown);
    ligne.addEventListener('pointermove', surPointerMove);
    ligne.addEventListener('pointerup', annuler);
    ligne.addEventListener('pointercancel', annuler);
    ligne.addEventListener('contextmenu', surContextMenu);

    return () => {
      ligne.removeEventListener('pointerdown', surPointerDown);
      ligne.removeEventListener('pointermove', surPointerMove);
      ligne.removeEventListener('pointerup', annuler);
      ligne.removeEventListener('pointercancel', annuler);
      ligne.removeEventListener('contextmenu', surContextMenu);
    };
  }, [annuler, ouvrirDepuisLaLigne, ouvrirEn]);

  /*
   * OUVERTURE AU CLAVIER.
   *
   * Entree et Espace parce que ce sont les touches d'activation attendues sur
   * un element focalisable ; Maj+F10 parce que c'est le raccourci systeme du
   * menu contextuel, celui que connaissent les utilisateurs de lecteurs d'ecran.
   *
   * Le menu s'ouvre au centre de la ligne, pas sous un pointeur qui n'existe
   * pas : au clavier il n'y a pas de position de souris a reprendre.
   */
  const onKeyDown = useCallback(
    (evenement: ReactKeyboardEvent<HTMLElement>) => {
      const menuSysteme = evenement.key === 'F10' && evenement.shiftKey;
      const activation = evenement.key === 'Enter' || evenement.key === ' ';

      if (!menuSysteme && !activation) {
        return;
      }

      const ligne = ancre.current?.closest('.bolt-chat-message-row');
      const boite = (ligne ?? ancre.current)?.getBoundingClientRect();

      if (!boite) {
        return;
      }

      evenement.preventDefault();
      ouvrirEn(boite.left + boite.width / 2, boite.top + boite.height / 2);
    },
    [ouvrirEn],
  );

  return {
    ancre,
    onKeyDown,
    ouvrirEn,
    gestes: { onPointerDown, onPointerMove, onPointerUp: annuler, onPointerCancel: annuler, onContextMenu },
    ouvert,
    position,
    fermer: useCallback(() => {
      if (menuDeMessageOuvert.get() === id) {
        menuDeMessageOuvert.set(null);
      }
    }, [id]),
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
  const panneau = useRef<HTMLDivElement | null>(null);
  const focusAvant = useRef<HTMLElement | null>(null);
  const [positionReelle, setPositionReelle] = useState<{ x: number; y: number } | null>(null);

  /*
   * LA TAILLE RÉELLE, MESURÉE APRÈS LE RENDU.
   *
   * `placerLeMenu` ne connaît qu'une estimation. Depuis que chaque entrée porte
   * son libellé, le menu s'élargit jusqu'à sa `max-width` — 366 px sur un
   * iPhone de 390 — et l'estimation de 232 px le laissait sortir de l'écran
   * (capture du 06/09 à 13:35 : « Régénérer à partir de ce promp… », coupé au
   * bord droit). On mesure donc le panneau une fois rendu, avant la peinture,
   * et on le ramène dans l'écran s'il en sort.
   */
  useLayoutEffect(() => {
    if (!ouvert || !panneau.current) {
      setPositionReelle(null);
      return;
    }

    const boite = panneau.current.getBoundingClientRect();
    const taille = { largeur: boite.width, hauteur: boite.height };

    /*
     * SUR TÉLÉPHONE, une barre d'icônes au-dessus du doigt, dans la zone utile :
     * sous l'en-tête, au-dessus de la zone de saisie (Avi, 07/09 08:03 : sur le
     * dernier message, le menu passait sous le composeur). Sur bureau, le menu
     * garde son ancrage au point de clic, ramené dans l'écran.
     */
    const surTelephone = Boolean(cibleFeuilleMobile(document));

    /*
     * SUR TÉLÉPHONE, l'abscisse est le CENTRE de la ligne (`pointDOuverture`) et
     * la feuille de style centre la barre dessus (`translateX(-50%)`) : sa
     * largeur n'entre pas dans le calcul. Mesuré le 08/09 (Chromium 412) :
     * placée depuis une largeur mesurée avant que ses icônes ne se posent
     * (130 px puis 54), la barre finissait 38 px à côté du centre.
     */
    const corrige = surTelephone
      ? {
          x: position.x,
          y: placerLaBarre(position, taille, {
            largeur: window.innerWidth,
            haut: document.querySelector('.bolt-mobile-ecode-header')?.getBoundingClientRect().bottom ?? 0,
            bas:
              document.querySelector('.bolt-project-agent-composer')?.getBoundingClientRect().top ?? window.innerHeight,
          }).y,
        }
      : ramenerDansLEcran(position, taille, { largeur: window.innerWidth, hauteur: window.innerHeight });

    setPositionReelle(corrige.x === position.x && corrige.y === position.y ? null : corrige);
  }, [ouvert, position]);

  /*
   * LE FOCUS ENTRE DANS LE MENU, ET IL EN REVIENT.
   *
   * Le retour du focus est la moitie qu'on oublie : sans lui, l'utilisateur au
   * clavier ferme le menu et se retrouve au debut du document, sans aucun
   * repere sur l'endroit qu'il venait de quitter. Un menu qu'on peut ouvrir
   * mais dont on ne revient pas est presque aussi genant qu'un menu inatteignable.
   */
  useEffect(() => {
    if (!ouvert) {
      return undefined;
    }

    focusAvant.current = document.activeElement as HTMLElement | null;

    const premier = panneau.current?.querySelector<HTMLElement>(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );

    /*
     * SANS FAIRE DÉFILER : le menu est fixé, mais un `focus()` nu demande au
     * conteneur de défilement d'amener l'élément en vue — mesuré sur WebKitGTK,
     * le fil reculait de 45 px à l'ouverture ; sur l'iPhone d'Avi il disparaissait
     * derrière le menu (07/09 08:03, « on ne voit plus le contenu »).
     */
    (premier ?? panneau.current)?.focus({ preventScroll: true });

    /*
     * EN PHASE DE CAPTURE, et en consommant la touche : le gestionnaire de
     * raccourcis du projet possède déjà Échap (`overlay.close`) et arrête sa
     * propagation avant tout écouteur en phase de bouillonnement — mesuré le
     * 07/09 (sonde probe-menu-escape.mjs) : `stopPropagation` depuis le paquet
     * BaseChat, le menu restait ouvert, son voile bloquait ensuite le « + » de
     * la barre du bas. Le menu du ⋮ fait de même, pour la même raison. Fermer
     * la surface la plus haute est la bonne priorité pour Échap.
     */
    const surEchappement = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape') {
        evenement.preventDefault();
        evenement.stopPropagation();
        fermer();
      }
    };

    window.addEventListener('keydown', surEchappement, true);

    /*
     * BUG-MESSAGE-MENU-IOS-001 — « jamais l'icône disparaît » : le menu se
     * ferme aussi au premier DÉFILEMENT du fil (en capture : la boîte qui
     * défile n'émet pas vers `window`) et à tout appui hors du panneau, même
     * si le voile n'est pas touché — sur iPhone, le geste qui suit l'appui
     * long commence souvent par un défilement, et un menu resté ouvert
     * bloquait ensuite la page (« je dois recharger »).
     */
    const surDefilement = (evenement: Event) => {
      if (panneau.current && evenement.target instanceof Node && panneau.current.contains(evenement.target)) {
        return;
      }

      fermer();
    };

    const surAppuiDehors = (evenement: Event) => {
      if (panneau.current && evenement.target instanceof Node && panneau.current.contains(evenement.target)) {
        return;
      }

      fermer();
    };

    window.addEventListener('scroll', surDefilement, true);
    document.addEventListener('pointerdown', surAppuiDehors, true);

    return () => {
      window.removeEventListener('keydown', surEchappement, true);
      window.removeEventListener('scroll', surDefilement, true);
      document.removeEventListener('pointerdown', surAppuiDehors, true);
      focusAvant.current?.focus?.();
    };
  }, [fermer, ouvert]);

  if (!ouvert) {
    return null;
  }

  const racineMobile = typeof document === 'undefined' ? null : cibleFeuilleMobile(document);

  const menu = (
    <>
      {/*
       * PLUS DE VOILE (BUG-MESSAGE-MENU-IOS-001). Il avalait le geste suivant :
       * un appui long sur un AUTRE message tombait dessus, le menu se fermait,
       * et rien ne s'ouvrait — deux gestes pour changer de message ; et il
       * bloquait le défilement du fil tant qu'un menu restait ouvert (« ça
       * fait bugger la page »). L'écouteur de `pointerdown` en capture sur le
       * document ferme le menu à tout appui hors du panneau, ET laisse le même
       * appui atteindre la ligne visée, qui arme son propre appui long.
       */}
      <div
        ref={panneau}
        className="bolt-message-context-menu"
        data-centre={racineMobile ? 'true' : undefined}
        role="menu"
        aria-label={etiquette}
        tabIndex={-1}
        style={{ left: `${(positionReelle ?? position).x}px`, top: `${(positionReelle ?? position).y}px` }}
      >
        {children}
      </div>
    </>
  );

  /*
   * SUR TÉLÉPHONE, LE MENU SE REND À LA RACINE DU GABARIT MOBILE — comme les
   * feuilles du composeur (`feuille-mobile.ts`). Rendu dans la bulle, il est
   * fixé mais reste DANS le contexte d'empilement du fil : le composeur collant
   * (z-index 50, frère du fil) passait devant lui — capture d'Avi, 07/09 08:03,
   * « Utile » et « À améliorer » cachés sous la zone de saisie sur le dernier
   * message. Hors de cette chaîne, son z-index vaut pour tout l'écran.
   */
  return racineMobile ? createPortal(menu, racineMobile) : menu;
}
