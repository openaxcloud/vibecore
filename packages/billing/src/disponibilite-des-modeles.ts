/*
 * Un modèle listé n'est pas un modèle joignable.
 *
 * Mesuré le 2026-09-16 : nos clés Anthropic et Moonshot sont VALIDES, leurs
 * catalogues répondent `200`, leurs modèles sont ouverts sur nos comptes — et
 * pourtant aucun appel ne passe, parce que les deux comptes sont à sec :
 *
 *   Anthropic  400  « Your credit balance is too low »
 *   Moonshot   429  « account is suspended due to insufficient balance »
 *
 * Afficher ces modèles comme disponibles casserait au premier clic. Les faire
 * disparaître serait pire : le jour du rechargement, il faudrait redéployer
 * pour les faire revenir. D'où le troisième état — MOMENTANÉMENT INDISPONIBLE —
 * qui les montre, les explique, et les rend inutilisables sans les effacer.
 *
 * La disponibilité est une PROPRIÉTÉ DU FOURNISSEUR, pas du modèle : une panne
 * de portefeuille frappe tous les modèles du même fournisseur à la fois. La
 * sonder par fournisseur coûte un appel au lieu de treize.
 */
import type { CatalogueDuMode, ModeleDuCatalogue } from './catalogue-de-modeles.js';

export type Fournisseur = ModeleDuCatalogue['provider'];

export type EtatDuFournisseur =
  /** Un appel réel a abouti. */
  | 'joignable'

  /** La clé est bonne, le compte est à sec ou suspendu. Un rechargement suffit. */
  | 'sans-credit'

  /** Aucune clé configurée pour ce fournisseur. */
  | 'sans-cle'

  /** L'appel a échoué pour une autre raison : réseau, panne, quota de débit. */
  | 'injoignable'

  /** Pas encore sondé depuis le démarrage. */
  | 'inconnu';

export interface SondeFournisseur {
  fournisseur: Fournisseur;
  etat: EtatDuFournisseur;

  /** Horodatage ISO de la sonde. Une sonde trop vieille ne vaut pas mieux qu'aucune. */
  sondeA?: string;

  /** Code HTTP et code d'erreur du fournisseur, pour le journal — jamais montré tel quel. */
  statut?: number;
  code?: string;
}

export type EtatDuModele = 'disponible' | 'momentanement-indisponible' | 'non-configure' | 'inconnu';

export interface ModeleAvecEtat extends ModeleDuCatalogue {
  etat: EtatDuModele;

  /** Pourquoi, quand ce n'est pas `disponible`. Clé de traduction, pas une phrase. */
  raison?: 'credit-fournisseur' | 'cle-absente' | 'fournisseur-injoignable' | 'jamais-sonde';
}

/**
 * Traduit l'état d'un fournisseur en état de modèle.
 *
 * `sans-credit` et `injoignable` donnent tous deux « momentanément
 * indisponible » : du point de vue de l'utilisateur, la différence — nous
 * devons de l'argent, ou leur service tousse — ne change rien à ce qu'il peut
 * faire. Elle change tout pour NOUS, et c'est pourquoi `raison` les distingue
 * dans le journal.
 */
export function etatDuModele(etat: EtatDuFournisseur): { etat: EtatDuModele; raison?: ModeleAvecEtat['raison'] } {
  switch (etat) {
    case 'joignable':
      return { etat: 'disponible' };
    case 'sans-credit':
      return { etat: 'momentanement-indisponible', raison: 'credit-fournisseur' };
    case 'injoignable':
      return { etat: 'momentanement-indisponible', raison: 'fournisseur-injoignable' };
    case 'sans-cle':
      return { etat: 'non-configure', raison: 'cle-absente' };
    default:
      return { etat: 'inconnu', raison: 'jamais-sonde' };
  }
}

/** Le catalogue d'un mode, chaque modèle portant son état réel. */
export function catalogueAvecEtats(catalogue: CatalogueDuMode, sondes: SondeFournisseur[]): ModeleAvecEtat[] {
  const parFournisseur = new Map(sondes.map((s) => [s.fournisseur, s.etat]));

  return catalogue.modeles.map((modele) => ({
    ...modele,
    ...etatDuModele(parFournisseur.get(modele.provider) ?? 'inconnu'),
  }));
}

/**
 * Le modèle que « Choisir automatiquement » retient parmi ceux qui RÉPONDENT.
 *
 * C'est la différence entre la règle sur le papier et la règle applicable : le
 * moins cher de la liste peut être injoignable. On reclasse sur les seuls
 * modèles disponibles, avec la même politique, et on rend `undefined` si aucun
 * ne répond — un mode entièrement en panne doit se dire, pas se deviner.
 */
export function modeleAutomatiqueJoignable(
  catalogue: CatalogueDuMode,
  sondes: SondeFournisseur[],
  coutMelange: (m: ModeleDuCatalogue, poids?: number) => number,
): ModeleAvecEtat | undefined {
  const joignables = catalogueAvecEtats(catalogue, sondes).filter((m) => m.etat === 'disponible');

  if (joignables.length === 0) {
    return undefined;
  }

  if (catalogue.automatique.politique === 'epingle') {
    return joignables.find((m) => m.model === catalogue.automatique.modeleEpingle);
  }

  const poids = catalogue.automatique.poidsSortie;

  return [...joignables].sort((a, b) => coutMelange(a, poids) - coutMelange(b, poids))[0];
}

/**
 * Lit la réponse d'un fournisseur et en déduit son état.
 *
 * Les codes viennent de mesures réelles, pas d'une supposition :
 *   Anthropic 400 + `invalid_request_error` dont le message parle de crédit ;
 *   Moonshot  429 + `exceeded_current_quota_error` ;
 *   les deux   401 quand la clé est refusée.
 */
export function etatDepuisReponse(statut: number, corps: string): EtatDuFournisseur {
  if (statut >= 200 && statut < 300) {
    return 'joignable';
  }

  const texte = corps.toLowerCase();

  const parleDArgent =
    texte.includes('credit balance') ||
    texte.includes('insufficient balance') ||
    texte.includes('exceeded_current_quota') ||
    texte.includes('quota');

  if (parleDArgent) {
    return 'sans-credit';
  }

  if (statut === 401 || statut === 403) {
    return 'sans-cle';
  }

  return 'injoignable';
}
