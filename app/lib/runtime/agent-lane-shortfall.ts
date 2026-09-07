/**
 * CE QUI A ÉTÉ ANNONCÉ ET QUI N'A PAS ÉTÉ ÉCRIT.
 *
 * Un rôle qui tombe au milieu laisse une application À MOITIÉ COHÉRENTE. C'est
 * l'espèce dangereuse : elle *paraît* finie, elle ne démarre pas, et rien ne dit
 * ce qui manque. Le défaut mesuré le 2026-09-07 était honnête par accident —
 * 9 fichiers sur 90, l'utilisateur voyait tout de suite qu'il n'avait rien.
 * 60 sur 90 se diagnostiquerait beaucoup plus longtemps.
 *
 * Ce module ne répare rien : il NOMME l'écart. C'est la condition pour qu'un
 * résultat partiel soit acceptable plutôt que trompeur.
 */

import { cleDeChemin } from './agent-lane-arbiter';

export interface RapportDeLane {
  roleId: string;
  status: 'complete' | 'partial' | 'failed';

  /** Les chemins que le rôle a DÉCLARÉS dans son rapport. */
  files?: string[];
}

export interface EcartDeLane {
  roleId: string;
  status: 'complete' | 'partial' | 'failed';
  annonces: number;
  ecrits: number;

  /** Les chemins annoncés qu'aucune écriture n'a couverts, dans l'ordre d'annonce. */
  manquants: string[];
}

/**
 * Confronte ce que chaque rôle a annoncé à ce qui a réellement été écrit.
 *
 * `cheminsEcrits` vient des attributions de l'arbitre — donc des actions
 * effectivement appliquées, pas d'une seconde déclaration. C'est ce qui
 * distingue cette mesure d'un simple recomptage du rapport : un rôle qui
 * annonce dix fichiers et n'en émet aucun rend ici dix manquants, alors que
 * son propre rapport se dit complet.
 */
export function ecartsDesLanes(rapports: RapportDeLane[], cheminsEcrits: Iterable<string>): EcartDeLane[] {
  const ecrits = new Set<string>();

  for (const chemin of cheminsEcrits) {
    const cle = cleDeChemin(chemin);

    if (cle) {
      ecrits.add(cle);
    }
  }

  return rapports.map((rapport) => {
    const annonces = rapport.files ?? [];

    const manquants = annonces.filter((chemin) => {
      const cle = cleDeChemin(chemin);
      return Boolean(cle) && !ecrits.has(cle);
    });

    return {
      roleId: rapport.roleId,
      status: rapport.status,
      annonces: annonces.length,
      ecrits: annonces.length - manquants.length,
      manquants,
    };
  });
}

/**
 * La livraison est-elle incomplète ?
 *
 * Vrai dès qu'un rôle a échoué OU qu'un fichier annoncé manque. Volontairement
 * strict : un rôle qui se dit « complete » en n'ayant rien écrit compte comme
 * incomplet, parce que c'est le cas qu'on vient de passer une journée à
 * démonter — un rapport qui se déclare bon ne prouve rien sur le disque.
 */
export function livraisonIncomplete(ecarts: EcartDeLane[]): boolean {
  return ecarts.some((ecart) => ecart.status === 'failed' || ecart.manquants.length > 0);
}

/**
 * Les écarts qu'il faut AVERTIR, ou rien.
 *
 * Extrait du composant plutôt que laissé en ligne, parce que c'est le SITE
 * D'APPEL — et c'est presque toujours lui, pas le calcul, que rien ne tient.
 * Trois décisions y sont prises, et chacune peut se défaire seule :
 *
 *  - rien tant que le résultat agrégé n'est pas là (en cours de flux, un
 *    fichier « manquant » est un fichier pas encore écrit) ;
 *  - rien si la livraison est complète, pour ne pas banaliser l'alerte ;
 *  - et seulement les rôles réellement en écart, pas la liste entière.
 */
export function ecartsAAvertir(
  rapports: RapportDeLane[] | undefined,
  cheminsEcrits: Iterable<string> | undefined,
  resultatAgregeArrive: boolean,
): EcartDeLane[] {
  /*
   * `undefined` = AUCUNE TRACE de ce message, et surtout pas « rien ecrit ».
   * Au rechargement de la page l'historique se reaffiche sans que rien n'ait
   * ete arbitre : traiter ce cas comme un ecart ferait crier « Livraison
   * incomplete » sur tous les anciens messages, pour des fichiers qui sont
   * pourtant sur le disque.
   */
  if (!resultatAgregeArrive || !rapports?.length || cheminsEcrits === undefined) {
    return [];
  }

  const ecarts = ecartsDesLanes(rapports, cheminsEcrits);

  if (!livraisonIncomplete(ecarts)) {
    return [];
  }

  return ecarts.filter((ecart) => ecart.status === 'failed' || ecart.manquants.length > 0);
}
