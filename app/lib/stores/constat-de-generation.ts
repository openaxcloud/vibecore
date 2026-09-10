import { atom } from 'nanostores';

import type { ConstatDeGeneration } from '~/lib/runtime/generation-incomplete';

/**
 * LE CONSTAT D'HONNÊTETÉ D'UNE GÉNÉRATION, ENTRE SON CALCUL ET SON AFFICHAGE.
 *
 * `analyserGeneration` est calculé dans `useMessageParser`, au seul endroit qui
 * sait que le filet de fin de flux a fermé l'artefact — l'information ne
 * survit nulle part ailleurs. Le bandeau « patchs appliqués », lui, est monté
 * dans `BaseChat`, dans un autre arbre, plusieurs couches plus loin. Sans ce
 * relais, le composant `AppliedFilesToast` acceptait bien une prop `constat`
 * et savait afficher le message honnête, mais RIEN ne la lui passait : la
 * moitié visible de la garde était du code mort, et le bandeau continuait
 * d'annoncer « les patchs ont bien été appliqués » sur une application sans
 * point d'entrée.
 *
 * `undefined` = rien à signaler, le bandeau garde son message d'origine.
 *
 * Remis à `undefined` à l'ouverture de chaque artefact : sans cette remise à
 * zéro, un constat malhonnête d'un tour précédent teindrait le bandeau du tour
 * suivant — un faux négatif est un mensonge dans l'autre sens, et il coûte
 * autant.
 */
export const constatDeGenerationStore = atom<ConstatDeGeneration | undefined>(undefined);
