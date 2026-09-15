import { atom } from 'nanostores';

/*
 * Un commit demandé depuis un autre panneau — « Changes » sous un point de
 * restauration du fil (RP-CKPT-06). L'onglet Git le consomme à l'ouverture :
 * il charge le détail du commit, le fait défiler à l'écran et remet l'atome
 * à zéro. Même mécanique que `rechercheDemandee` pour « Trouver les usages ».
 */
export const commitDemande = atom<string | null>(null);
