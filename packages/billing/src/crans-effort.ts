/*
 * Combien de crans le curseur d'effort doit-il afficher ?
 *
 * Réponse mesurée le 2026-09-16, et elle n'est pas « cinq » :
 *
 *   claude-fable-5-1   low / medium / high / xhigh / max   → 5
 *   claude-opus-5      low / medium / high / xhigh / max   → 5
 *   claude-sonnet-5    low / medium / high / xhigh / max   → 5
 *   claude-sonnet-4-6  low / medium / high / max           → 4
 *   claude-haiku-4-5   (aucun)                             → 0
 *
 * Ces valeurs viennent de `GET /v1/models/{id}` chez Anthropic, qui DÉCLARE
 * `capabilities.effort` par modèle. Un curseur figé à cinq crans proposerait
 * `xhigh` sur Sonnet 4.6, que le modèle refuse, et proposerait un réglage à
 * Haiku 4.5, qui n'en a aucun.
 *
 * ⚠️ Les deux fournisseurs ne se comportent pas pareil, et c'est la raison
 * d'être de ce module :
 *
 *   - Anthropic DÉCLARE les crans, par modèle, dans son API. Lisible par
 *     machine, donc vérifiable : `crans-effort.spec.ts` compare ce tableau à
 *     ce que l'API a répondu le jour de la relève.
 *   - OpenAI NE DÉCLARE RIEN. Son objet modèle ne porte que
 *     `id / object / created / owned_by / shutdown_date`. Sa documentation dit
 *     que `reasoning.effort` accepte `none, minimal, low, medium, high, xhigh,
 *     max` et que « certains modèles n'en acceptent qu'un sous-ensemble —
 *     consultez la page du modèle ». Il n'y a donc PAS de source machine : ce
 *     tableau est une relève humaine, datée, à refaire quand une grille change.
 *
 * Conséquence de conception : la source de vérité est CE tableau, pas l'API.
 * L'API sert de contre-épreuve là où elle existe.
 */

/** Les crans, du plus économe au plus fouillé. L'ordre est signifiant. */
export const CRANS_CONNUS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

export type CranEffort = (typeof CRANS_CONNUS)[number];

export interface CransDuModele {
  /** Vide = le modèle ne propose aucun réglage d'effort : le curseur se désactive. */
  crans: CranEffort[];

  /** Cran conseillé, quand le fournisseur en recommande un. */
  conseille?: CranEffort;

  /** Comment la valeur a été obtenue — une déclaration d'API ou une relève humaine. */
  source: 'api-anthropic' | 'documentation-openai';
  releve: string;
}

const TABLE: Record<string, CransDuModele> = {
  /* Déclarés par GET /v1/models/{id} — relevés le 2026-09-16. */
  'claude-fable-5-1': {
    crans: ['low', 'medium', 'high', 'xhigh', 'max'],
    conseille: 'high',
    source: 'api-anthropic',
    releve: '2026-09-16',
  },
  'claude-opus-5': {
    crans: ['low', 'medium', 'high', 'xhigh', 'max'],
    conseille: 'high',
    source: 'api-anthropic',
    releve: '2026-09-16',
  },
  'claude-sonnet-5': {
    crans: ['low', 'medium', 'high', 'xhigh', 'max'],
    conseille: 'medium',
    source: 'api-anthropic',
    releve: '2026-09-16',
  },
  'claude-sonnet-4-6': {
    crans: ['low', 'medium', 'high', 'max'],
    conseille: 'medium',
    source: 'api-anthropic',
    releve: '2026-09-16',
  },
  'claude-haiku-4-5': { crans: [], source: 'api-anthropic', releve: '2026-09-16' },

  /* Relevés dans la documentation OpenAI — aucune déclaration machine. */
  'gpt-6-astra': {
    crans: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    conseille: 'high',
    source: 'documentation-openai',
    releve: '2026-09-16',
  },
  'gpt-5.6-sol': {
    crans: ['minimal', 'low', 'medium', 'high'],
    conseille: 'medium',
    source: 'documentation-openai',
    releve: '2026-09-16',
  },
  'gpt-5.6-terra': {
    crans: ['minimal', 'low', 'medium', 'high'],
    conseille: 'medium',
    source: 'documentation-openai',
    releve: '2026-09-16',
  },
  'gpt-5.6-luna': {
    crans: ['minimal', 'low', 'medium', 'high'],
    conseille: 'low',
    source: 'documentation-openai',
    releve: '2026-09-16',
  },
};

/**
 * Les crans que le curseur doit offrir pour ce modèle.
 *
 * Un modèle inconnu rend une liste VIDE — donc un curseur désactivé — et jamais
 * une liste par défaut : proposer `xhigh` à un modèle qui le refuse produit une
 * erreur au premier envoi, c'est-à-dire chez l'utilisateur. Le silence se
 * corrige en ajoutant une ligne au tableau ; une valeur inventée, non.
 */
export function cransPour(modele: string): CransDuModele {
  return TABLE[modele] ?? { crans: [], source: 'documentation-openai', releve: 'inconnu' };
}

/** Vrai quand le curseur doit être rendu ; faux quand il doit être masqué ou grisé. */
export function curseurActif(modele: string): boolean {
  return cransPour(modele).crans.length > 1;
}

/**
 * Ramène une valeur d'effort dans ce que le modèle accepte.
 *
 * Sert au changement de modèle : l'utilisateur laisse `xhigh` sur Opus 5 puis
 * bascule sur Sonnet 4.6, qui ne connaît pas ce cran. On ne renvoie jamais un
 * cran refusé — on prend le plus proche vers le BAS, et à défaut le plus bas
 * disponible. Descendre coûte moins cher que monter : en cas de doute, on ne
 * facture pas à l'utilisateur un effort qu'il n'a pas demandé.
 */
export function cranAdmissible(modele: string, souhaite: CranEffort): CranEffort | undefined {
  const { crans } = cransPour(modele);

  if (crans.length === 0) {
    return undefined;
  }

  if (crans.includes(souhaite)) {
    return souhaite;
  }

  const rangSouhaite = CRANS_CONNUS.indexOf(souhaite);
  const enDessous = crans.filter((cran) => CRANS_CONNUS.indexOf(cran) < rangSouhaite);

  return enDessous.length > 0 ? enDessous[enDessous.length - 1] : crans[0];
}
