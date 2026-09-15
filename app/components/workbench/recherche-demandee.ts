import { atom } from 'nanostores';

/*
 * Une recherche demandée depuis un autre panneau — « Trouver les usages »
 * d'un secret (RP-SEC-08). Le panneau Recherche la consomme à l'ouverture :
 * il pose la requête, lance la recherche et remet l'atome à zéro.
 */
export const rechercheDemandee = atom<string | null>(null);
