/*
 * Le catalogue de modèles par mode, et la règle « choisir automatiquement ».
 *
 * La carte de routage d'origine dit UN modèle par mode. La maquette d'Avi laisse
 * l'utilisateur choisir SON modèle dans une liste, par mode. Ce fichier porte
 * cette liste — et, surtout, la RÈGLE de sélection automatique sous forme de
 * DONNÉE et non de code : « le moins cher de la liste » est aujourd'hui la règle
 * d'Avi, et il doit pouvoir la changer pour un mode sans qu'on recompile quoi
 * que ce soit.
 *
 * ⚠️ Deux des entrées ne sont pas des modèles mais des MODES DE SERVICE, mesuré
 * le 2026-09-16 : « Claude Opus 5 Fast » est `claude-opus-5` avec
 * `speed: "fast"`, et « GPT-5.6 Luna Fast » est `gpt-5.6-luna` avec
 * `service_tier: "fast"`. Leurs identifiants « …-fast » rendent 404 chez les
 * deux fournisseurs — contrôle négatif fait avec un identifiant bidon, qui rend
 * le même 404. On les porte donc comme une OPTION de l'entrée, jamais comme un
 * identifiant inventé.
 */
import type { AgentMode, AgentRoutingCard } from './agent-routing.js';

export interface ModeleDuCatalogue {
  /** Identifiant réel chez le fournisseur. Jamais un nom commercial. */
  model: string;
  provider: 'anthropic' | 'openai' | 'google' | 'moonshot';

  /** Coût de revient, cents par million de jetons. */
  costInCentsPerM: number;
  costOutCentsPerM: number;

  /**
   * Mode de service du fournisseur, quand l'entrée en est un.
   * `fast` = `speed: "fast"` chez Anthropic, `service_tier: "fast"` chez OpenAI.
   */
  serviceTier?: 'fast';

  /**
   * Le modèle servi quand celui-ci ne répond pas. DONNÉE, jamais du code.
   *
   * Règle d'Avi : « utilise le modèle Opus si le modèle Fable n'est plus
   * disponible ». Elle est ici une ligne de catalogue parmi d'autres, pas un
   * cas particulier enfoui dans une fonction — la changer est un changement de
   * carte, pas un chantier.
   *
   * Deux contraintes que `catalogue-repli.spec.ts` fait respecter :
   *   le repli doit exister dans le catalogue DU MÊME MODE ;
   *   sa marge doit rester positive au multiplicateur de ce mode. Un repli qui
   *   nous fait vendre à perte est pire que l'indisponibilité.
   */
  repli?: { model: string; serviceTier?: 'fast' };
}

/**
 * La politique de sélection automatique, exprimée en donnée.
 *
 * `moins-cher` classe sur un coût MÉLANGÉ — entrée + sortie pondérée — parce
 * qu'un classement sur le seul prix d'entrée élit le mauvais modèle dès que
 * deux candidats ont la même entrée et des sorties différentes. Le poids est
 * lui aussi une donnée : c'est la forme de notre trafic, pas une constante
 * universelle.
 */
export interface PolitiqueAutomatique {
  politique: 'moins-cher' | 'epingle';

  /** Requis quand la politique est `epingle`. */
  modeleEpingle?: string;

  /** Jetons de sortie par jeton d'entrée. Défaut 0,25 (mesuré sur un agent de code). */
  poidsSortie?: number;
}

export interface CatalogueDuMode {
  mode: AgentMode;
  modeles: ModeleDuCatalogue[];
  automatique: PolitiqueAutomatique;
}

export const POIDS_SORTIE_PAR_DEFAUT = 0.25;

/** Coût d'un modèle pour un million de jetons d'entrée et `poids` million de sortie. */
export function coutMelange(modele: ModeleDuCatalogue, poids = POIDS_SORTIE_PAR_DEFAUT): number {
  return modele.costInCentsPerM + modele.costOutCentsPerM * poids;
}

/**
 * Le modèle que « Choisir automatiquement » retient pour ce mode.
 *
 * Rend `undefined` plutôt qu'un défaut arbitraire quand la liste est vide ou que
 * le modèle épinglé n'y est pas : l'appelant doit pouvoir dire « aucun modèle
 * disponible » à l'utilisateur, pas en servir un qu'on n'a pas choisi.
 */
export function modeleAutomatique(catalogue: CatalogueDuMode): ModeleDuCatalogue | undefined {
  if (catalogue.modeles.length === 0) {
    return undefined;
  }

  if (catalogue.automatique.politique === 'epingle') {
    return catalogue.modeles.find((m) => m.model === catalogue.automatique.modeleEpingle);
  }

  const poids = catalogue.automatique.poidsSortie ?? POIDS_SORTIE_PAR_DEFAUT;

  return [...catalogue.modeles].sort((a, b) => coutMelange(a, poids) - coutMelange(b, poids))[0];
}

export interface MargeDuModele {
  mode: AgentMode;
  model: string;
  multiplicateur: number;
  margeEntree: number;
  margeSortie: number;
  negative: boolean;
}

/**
 * La marge de CHAQUE modèle de CHAQUE mode, au multiplicateur de son mode.
 *
 * C'est la garde qu'Avi a demandée : trois modèles coûtent 1000/5000 — Fable
 * 5.1, GPT-6 Astra, et Opus 5 en mode fast — alors que le prix utilisateur au
 * multiplicateur ×1 est 650/3250. Les proposer ailleurs qu'en Max (×2) revient
 * à vendre 54 % sous le prix d'achat.
 */
export function margesDuCatalogue(card: AgentRoutingCard, catalogues: CatalogueDuMode[]): MargeDuModele[] {
  const marges: MargeDuModele[] = [];

  for (const catalogue of catalogues) {
    const ligne = card.lines.find((l) => l.key === catalogue.mode);

    if (!ligne) {
      continue;
    }

    const prixEntree = card.baseUserInCentsPerM * ligne.multiplier;
    const prixSortie = card.baseUserOutCentsPerM * ligne.multiplier;

    for (const modele of catalogue.modeles) {
      const margeEntree = prixEntree > 0 ? (prixEntree - modele.costInCentsPerM) / prixEntree : -1;
      const margeSortie = prixSortie > 0 ? (prixSortie - modele.costOutCentsPerM) / prixSortie : -1;

      marges.push({
        mode: catalogue.mode,
        model: modele.model,
        multiplicateur: ligne.multiplier,
        margeEntree,
        margeSortie,
        negative: margeEntree < 0 || margeSortie < 0,
      });
    }
  }

  return marges;
}

/** Les modèles vendus sous leur prix d'achat. Vide = rien à perte. */
export function modelesAPerte(card: AgentRoutingCard, catalogues: CatalogueDuMode[]): MargeDuModele[] {
  return margesDuCatalogue(card, catalogues).filter((m) => m.negative);
}
