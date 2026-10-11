import { useEffect, useLayoutEffect } from 'react';

/**
 * Passe-plat de la DISPOSITION des panneaux, d'une coquille au vrai composant.
 *
 * BUG-IDE-SPLIT-EFFACE-001 — un partage de panneau fait pendant le chargement
 * disparaissait ~2,5 s plus tard, sans un appel réseau. Mesuré le 16/09 sur un
 * build instrumenté (CPU ×20 + 4 boucles) : `BaseChat` est monté TROIS fois au
 * démarrage — coquille `ClientOnly`, coquille `Suspense` pendant le chargement
 * différé de `Chat.client`, puis le vrai composant ; et `Chat` garde encore la
 * sienne tant que l'historique charge. Chaque coquille est un `BaseChat`
 * complet, donc pleinement interactif ; puis elle est remplacée par un TYPE
 * différent à la même position, et React démonte tout. La remise à « 1 feuille »
 * n'était pas une restauration : c'était le remontage, et il emportait le geste.
 *
 * Reproduit à volonté avec `GET …/ide-state` retardé de 6 s : partage sur la
 * coquille → 1 feuille après la bascule (`tests/e2e/ide-split-sur-coquille.spec.ts`).
 *
 * La disposition est donc tenue HORS de React — la seule chose qui survive au
 * démontage — le temps de la bascule : déposée à chaque changement et au
 * démontage (phase layout), lue par le composant suivant pendant son rendu.
 * Le rendu du vrai composant PRÉCÈDE le commit qui démonte la coquille : un
 * dépôt fait au seul démontage arriverait après la lecture (mesuré). Même
 * forme que le passe-plat du composeur (#552), qui traite la frappe faite
 * dans la même fenêtre.
 *
 * Elle est PORTÉE PAR SA PORTÉE (projet + fenêtre d'édition) et PÉRIMÉE au-delà
 * de quelques secondes : une bascule dure des dixièmes de seconde, jamais une
 * minute. Au-delà, ce n'est plus une bascule, c'est un retour sur le projet, et
 * l'état persisté fait foi.
 */
export const useLayoutHandoffEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export interface DispositionTransmise<Arbre, Flottant> {
  paneTree: Arbre;
  activePaneId: string;
  floatingPanes: Flottant[];
}

export const VALIDITE_DISPOSITION_TRANSMISE_MS = 30_000;

type Entree = { portee: string; disposition: DispositionTransmise<unknown, unknown>; deposeeA: number };

let enAttente: Entree | null = null;

/** Portée stable de part et d'autre de la bascule : le projet ET la fenêtre d'édition. */
export function porteeDisposition(projectId: string | undefined, fenetre: string): string {
  return `${projectId ?? ''}:${fenetre}`;
}

export function deposerDisposition<Arbre, Flottant>(
  portee: string,
  disposition: DispositionTransmise<Arbre, Flottant>,
  maintenant = Date.now(),
): void {
  enAttente = { portee, disposition, deposeeA: maintenant };
}

/**
 * Lecture SANS consommation, pour l'initialisation de l'état : un rendu peut
 * être rejoué (StrictMode) et une lecture consommante y perdrait la disposition.
 */
export function lireDispositionTransmise<Arbre, Flottant>(
  portee: string,
  maintenant = Date.now(),
): DispositionTransmise<Arbre, Flottant> | null {
  if (!enAttente || enAttente.portee !== portee) {
    return null;
  }

  if (maintenant - enAttente.deposeeA > VALIDITE_DISPOSITION_TRANSMISE_MS) {
    enAttente = null;

    return null;
  }

  return enAttente.disposition as DispositionTransmise<Arbre, Flottant>;
}

/** Consommation, une fois montée. Une disposition d'une autre portée est laissée à son destinataire. */
export function consommerDispositionTransmise(portee: string): void {
  if (enAttente?.portee === portee) {
    enAttente = null;
  }
}

export function oublierDispositionTransmise(): void {
  enAttente = null;
}
