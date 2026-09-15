/**
 * BUG-DEPLOY-PROVIDERS-UI-001 — « les fournisseurs ne fonctionnent pas »
 * (Avi, 09/09, captures iPhone).
 *
 * Ils ne pouvaient pas. Six des sept hébergeurs proposés par l'assistant
 * demandent des identifiants — crochet de build Vercel, jeton GitHub Pages,
 * déclencheur Cloud Run… — et l'assistant les listait tous, indistinctement.
 * On remplissait le formulaire entier avant d'apprendre, par un 503, que le
 * fournisseur choisi n'avait aucune chance d'aboutir.
 *
 * La règle : **une liste ne propose que ce qu'elle peut tenir**. Ce qui reste
 * hors d'atteinte apparaît quand même, désactivé, en nommant les variables
 * manquantes — c'est ce qu'il faut pour agir, et ce sont des NOMS, jamais des
 * valeurs (règle 12).
 *
 * En l'absence de relevé (route indisponible, ancien serveur), on ne masque
 * RIEN : un fournisseur qui marche resterait alors caché sans raison, ce qui
 * serait pire que le défaut d'origine.
 */

export interface DisponibiliteFournisseur {
  provider?: string;
  configured?: boolean;
  missingEnv?: unknown;
}

export interface FournisseurOffrable<T> {
  readonly fournisseur: T;
  readonly utilisable: boolean;
  readonly manquantes: readonly string[];
}

function nomsDeVariables(valeur: unknown): readonly string[] {
  return Array.isArray(valeur) ? valeur.filter((entree): entree is string => typeof entree === 'string') : [];
}

export function fournisseursOffrables<T extends { id: string }>(
  catalogue: readonly T[],
  disponibilite: unknown,
): readonly FournisseurOffrable<T>[] {
  const releve = Array.isArray(disponibilite) ? (disponibilite as DisponibiliteFournisseur[]) : [];

  return catalogue.map((fournisseur) => {
    const entree = releve.find((ligne) => ligne?.provider === fournisseur.id);

    /* Aucun relevé pour ce fournisseur : on le laisse utilisable. */
    if (!entree) {
      return { fournisseur, utilisable: true, manquantes: [] };
    }

    return {
      fournisseur,
      utilisable: entree.configured !== false,
      manquantes: entree.configured === false ? nomsDeVariables(entree.missingEnv) : [],
    };
  });
}

/**
 * Le fournisseur préselectionné : le premier qui peut aboutir. « static »
 * n'exige rien et reste donc le choix naturel — mais s'il venait à être
 * indisponible, mieux vaut ouvrir sur un choix vivant que sur un mur.
 */
export function fournisseurParDefaut<T extends { id: string }>(
  offrables: readonly FournisseurOffrable<T>[],
  souhaite = 'static',
): string {
  const prefere = offrables.find((entree) => entree.fournisseur.id === souhaite && entree.utilisable);

  if (prefere) {
    return prefere.fournisseur.id;
  }

  return offrables.find((entree) => entree.utilisable)?.fournisseur.id ?? souhaite;
}
