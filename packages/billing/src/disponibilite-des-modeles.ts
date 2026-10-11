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

/*
 * Les cinq états d'un fournisseur. Les commentaires sont ICI et non entre les
 * membres de l'union : un commentaire au milieu d'une expression met
 * `@blitz/lines-around-comment` et prettier en désaccord, et leur correction
 * automatique tourne en rond.
 *
 *   joignable    un appel réel a abouti ;
 *   sans-credit  la clé est bonne, le compte est à sec ou suspendu — un
 *                rechargement suffit, aucun déploiement ;
 *   sans-cle     aucune clé configurée pour ce fournisseur ;
 *   injoignable  échec pour une autre raison : réseau, panne, quota de débit ;
 *   inconnu      pas encore sondé. Ce n'est PAS « indisponible » : l'absence de
 *                verdict n'est jamais un verdict.
 */
export type EtatDuFournisseur = 'joignable' | 'sans-credit' | 'sans-cle' | 'injoignable' | 'inconnu';

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

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * LE REPLI — un seul saut, visible, et jamais à perte.
 *
 * L'utilisateur a choisi un modèle. Quand il ne répond pas, lui servir autre
 * chose EN SILENCE serait le tromper ; lui rendre une erreur alors qu'un modèle
 * comparable est disponible serait une panne qu'on s'inflige. Le repli résout
 * les deux, à trois conditions :
 *
 *   1. il est DÉCLARÉ dans le catalogue, donc modifiable sans redéployer ;
 *   2. il ne fait qu'UN saut. Pas de cascade, pas de boucle : si le repli est
 *      lui aussi en panne, on l'annonce honnêtement ;
 *   3. il est VISIBLE — la résolution dit ce qui a été demandé et ce qui sera
 *      servi, pour que la surface l'affiche.
 *
 * ⚠️ Une limite à dire plutôt qu'à masquer : un repli chez le MÊME fournisseur
 * ne survit pas à la seule panne qu'on ait réellement mesurée — un compte à
 * sec coupe tous ses modèles d'un coup. `claude-fable-5-1 → claude-opus-5` est
 * la règle d'Avi et elle est appliquée telle quelle ; elle protège d'une panne
 * propre au modèle, pas d'une panne de fournisseur. Les autres replis du
 * catalogue visent donc un fournisseur DIFFÉRENT quand il en existe un dont la
 * marge tient.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface Resolution {
  /** Ce que l'utilisateur avait demandé. */
  demande: { model: string; serviceTier?: 'fast' };

  /** Ce qui sera réellement appelé. Absent = rien de joignable. */
  servi?: ModeleAvecEtat;

  /** Vrai quand `servi` n'est pas `demande` : la surface doit le dire. */
  repliApplique: boolean;

  /** Pourquoi le demandé n'a pas pu servir. */
  raison?: ModeleAvecEtat['raison'];
}

/**
 * Le modèle réellement servi pour un choix donné, repli compris.
 *
 * Un seul saut : on ne suit jamais le repli du repli. C'est ce qui rend la
 * boucle impossible même si deux entrées se désignent l'une l'autre, et c'est
 * aussi ce qui garde la promesse lisible — l'utilisateur voit au plus un
 * remplacement, pas une chaîne dont personne ne sait où elle s'arrête.
 */
export function resoudreAvecRepli(
  catalogue: CatalogueDuMode,
  sondes: SondeFournisseur[],
  demande: { model: string; serviceTier?: 'fast' },
): Resolution {
  const avecEtats = catalogueAvecEtats(catalogue, sondes);

  const memeEntree = (a: { model: string; serviceTier?: 'fast' }, b: { model: string; serviceTier?: 'fast' }) =>
    a.model === b.model && a.serviceTier === b.serviceTier;

  const choisi = avecEtats.find((m) => memeEntree(m, demande));

  if (!choisi) {
    return { demande, repliApplique: false, raison: 'jamais-sonde' };
  }

  if (choisi.etat === 'disponible') {
    return { demande, servi: choisi, repliApplique: false };
  }

  const declare = choisi.repli;

  if (!declare) {
    return { demande, repliApplique: false, raison: choisi.raison };
  }

  const repli = avecEtats.find((m) => memeEntree(m, declare));

  /*
   * Le repli est en panne lui aussi : on s'arrête là. Suivre SON repli
   * fabriquerait une cascade dont la longueur dépend de l'état du monde, et
   * l'utilisateur ne saurait plus ce qu'il paie.
   */
  if (!repli || repli.etat !== 'disponible') {
    return { demande, repliApplique: false, raison: choisi.raison };
  }

  return { demande, servi: repli, repliApplique: true, raison: choisi.raison };
}

/** Un repli déclaré qui ne tient pas ses deux promesses. */
export interface RepliInvalide {
  mode: string;
  model: string;
  repli: string;
  faute: 'absent-du-catalogue' | 'marge-negative';
}

/**
 * Les replis déclarés qui pointent à côté.
 *
 * Deux fautes possibles, et la seconde est la coûteuse : un repli vers une
 * entrée dont la marge est négative au multiplicateur du mode nous ferait
 * vendre à perte au moment précis où on croit rendre service.
 */
export function replisInvalides(
  catalogues: CatalogueDuMode[],
  margeNegative: (mode: string, model: string, serviceTier?: 'fast') => boolean,
): RepliInvalide[] {
  const fautes: RepliInvalide[] = [];

  for (const catalogue of catalogues) {
    for (const modele of catalogue.modeles) {
      if (!modele.repli) {
        continue;
      }

      const cible = catalogue.modeles.find(
        (m) => m.model === modele.repli!.model && m.serviceTier === modele.repli!.serviceTier,
      );

      if (!cible) {
        fautes.push({
          mode: catalogue.mode,
          model: modele.model,
          repli: modele.repli.model,
          faute: 'absent-du-catalogue',
        });
        continue;
      }

      if (margeNegative(catalogue.mode, cible.model, cible.serviceTier)) {
        fautes.push({ mode: catalogue.mode, model: modele.model, repli: cible.model, faute: 'marge-negative' });
      }
    }
  }

  return fautes;
}
