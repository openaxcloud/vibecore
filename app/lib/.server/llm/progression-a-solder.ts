import type { ProgressAnnotation } from '~/types/context';

/**
 * SOLDER LES ÉTAPES DE PROGRESSION RESTÉES OUVERTES.
 *
 * Une étape passée à `in-progress` et jamais repassée à `complete` reste
 * vivante côté client POUR TOUJOURS : la déduplication de `ProgressCompilation`
 * est indexée par étiquette, `hasActiveWork` vaut donc vrai, et la barre de
 * statut affiche l'anneau qui tourne alors que la réponse est terminée et
 * affichée en dessous.
 *
 * Le cas mesuré : le bloc d'optimisation de contexte ouvre DEUX étiquettes
 * (`summary` puis `context`) mais son `catch` n'en soldait qu'UNE. Un rejet de
 * `createSummary` — un 429 du fournisseur, un dépassement de fenêtre (soit
 * précisément la situation qui déclenche le résumé), un abandon client —
 * sautait par-dessus le `complete` de `summary`, et la génération se terminait
 * ensuite parfaitement : « ⟳ Analysing request · 66 % » sous une réponse
 * complète.
 *
 * Corriger la seule étiquette `summary` aurait corrigé l'occurrence, pas la
 * règle : la troisième étape ajoutée dans ce bloc demain retomberait dans le
 * même trou. Ce suivi enveloppe donc l'ÉCRITURE elle-même — tout ce qui passe
 * par lui est compté, et le chemin d'échec solde ce qui reste sans avoir à
 * connaître la liste des étiquettes.
 */
export interface SuiviDeProgression {
  /** Écrit l'annotation ET tient à jour la liste des étiquettes ouvertes. */
  ecrire(annotation: ProgressAnnotation): void;

  /** Les étiquettes passées à `in-progress` et jamais soldées, dans l'ordre d'ouverture. */
  etiquettesOuvertes(): string[];

  /**
   * Écrit une annotation terminale pour chaque étiquette encore ouverte et rend
   * leur nombre. Idempotent : un second appel n'écrit plus rien.
   */
  solderRestantes(fabriquer: (etiquette: string) => ProgressAnnotation): number;
}

export function creerSuiviDeProgression(ecrire: (annotation: ProgressAnnotation) => void): SuiviDeProgression {
  /*
   * Une `Map` et non un `Set` : l'ordre d'insertion est garanti, donc les
   * annotations de soldes partent dans l'ordre où les étapes ont commencé —
   * ce que le client affiche de haut en bas.
   */
  const ouvertes = new Map<string, true>();

  return {
    ecrire(annotation) {
      if (annotation.status === 'in-progress') {
        ouvertes.set(annotation.label, true);
      } else {
        ouvertes.delete(annotation.label);
      }

      ecrire(annotation);
    },

    etiquettesOuvertes() {
      return [...ouvertes.keys()];
    },

    solderRestantes(fabriquer) {
      const restantes = [...ouvertes.keys()];

      for (const etiquette of restantes) {
        /*
         * Retirer AVANT d'écrire : si `fabriquer` ou l'écriture lève, on ne
         * veut pas boucler sur la même étiquette au prochain solde.
         */
        ouvertes.delete(etiquette);
        ecrire(fabriquer(etiquette));
      }

      return restantes.length;
    },
  };
}
