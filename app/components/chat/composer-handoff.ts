import { useEffect, useLayoutEffect } from 'react';

/**
 * Passe-plat pour la frappe faite AVANT que la conversation ait un état.
 *
 * `Chat` rend deux composants DIFFÉRENTS à la même position : un `BaseChat` nu
 * tant que l'historique charge (`!ready`), puis `ChatImpl` — qui rend son propre
 * `BaseChat`. React voit deux types distincts au même endroit : il démonte tout
 * et remonte. Mesuré à 390 sur un serveur froid, la bascule survient ~1 s après
 * l'apparition du champ, et une frappe au clavier envoyée dans cet intervalle
 * est perdue en silence — le champ est contrôlé, React réécrit sa valeur
 * (`restoreControlledState`) et le nœud lui-même est remplacé.
 *
 * Le brouillon de `composer-draft.ts` ne couvre pas ce cas : il est écrit depuis
 * l'état `input`, or la coquille d'avant-`ready` n'a AUCUN état de chat, donc
 * rien n'y arrive jamais. Et il est indexé par projet, alors que la perte touche
 * aussi la conversation autonome, qui n'a pas de projet.
 *
 * Ce module tient donc la frappe en attente HORS de React — c'est la seule
 * chose qui survive au démontage — le temps de la bascule.
 *
 * La valeur est PORTÉE PAR SA PORTÉE : sans cela, un texte tapé dans le projet A
 * puis abandonné réapparaîtrait dans le composeur du projet B.
 */

/*
 * La capture et la restitution se font en phase LAYOUT, pas en phase passive.
 *
 * Avec des effets passifs, la remise et le retour du focus arrivaient APRÈS que
 * le navigateur ait pu délivrer d'autres touches : mesuré à 390, une frappe
 * continue perdait tout ce qui suivait le premier mot (« Ajoute » conservé, le
 * reste dans le vide). En phase layout, la capture au démontage et la
 * restitution au montage tiennent dans le MÊME commit React, que le navigateur
 * ne peut pas interrompre pour délivrer un événement clavier.
 */
export const useComposerHandoffLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

type PendingInput = { scope: string; value: string };

let pending: PendingInput | null = null;

/** Portée stable de part et d'autre de la bascule (aucune navigation entre les deux). */
export function composerHandoffScope(projectId: string | undefined, pathname: string | undefined): string {
  return projectId ? `project:${projectId}` : `path:${pathname ?? ''}`;
}

export function setPendingComposerInput(scope: string, value: string): void {
  pending = value.length > 0 ? { scope, value } : null;
}

/**
 * Rend la frappe en attente de CETTE portée et la consomme. Une valeur d'une
 * autre portée est laissée en place : elle appartient à un autre composeur, et
 * la jeter ici la ferait disparaître pour lui aussi.
 */
export function takePendingComposerInput(scope: string): string | null {
  if (!pending || pending.scope !== scope) {
    return null;
  }

  const { value } = pending;
  pending = null;

  return value;
}

/** Lecture sans consommation — pour les tests et le diagnostic. */
export function peekPendingComposerInput(): PendingInput | null {
  return pending;
}

export function clearPendingComposerInput(): void {
  pending = null;
}
