/**
 * BUG-PERF-I18N-RACINE-001 — ce que le build doit avoir ÉMIS, lu sur
 * l'artefact par `scripts/verifier-chemin-critique.ts`.
 *
 * Deux choses, parce que deux défauts distincts sont possibles :
 *   1. un catalogue JSON absent — le navigateur hydraterait avec des
 *      « Unavailable » partout (la requête rend 404, l'entrée client hydrate
 *      quand même, par choix) ;
 *   2. un catalogue revenu dans un chunk JavaScript du chemin critique — c'est
 *      le défaut du 2026-09-14 lui-même, et le cliquet d'octets ne le verrait
 *      qu'une fois franchi. On cherche donc un TÉMOIN : une clé prise dans le
 *      JSON émis, qui ne doit apparaître dans aucun chunk de la racine.
 */
export const LANGUES_EMISES = ['en', 'fr', 'es', 'ar'] as const;

/**
 * Les minimums viennent de la mesure du 2026-09-14 (10 548 clés en/fr, 45 es/ar),
 * arrondis bas : un JSON de 12 clés serait un build qui a évalué le mauvais
 * module, pas un catalogue.
 */
export const MINIMUM_DE_CLES: Record<(typeof LANGUES_EMISES)[number], number> = {
  en: 10_000,
  fr: 10_000,
  es: 40,
  ar: 40,
};

export function fichierDuCatalogue(fichiers: readonly string[], langue: string): string | undefined {
  const motif = new RegExp(`^catalogue-${langue}-[0-9a-f]{10}\\.json$`);

  return fichiers.find((nom) => motif.test(nom));
}

export function cataloguesManquants(fichiers: readonly string[]): string[] {
  return LANGUES_EMISES.filter((langue) => fichierDuCatalogue(fichiers, langue) === undefined);
}

export function catalogueTropPetit(langue: (typeof LANGUES_EMISES)[number], json: string): string | undefined {
  let cles: number;

  try {
    const contenu: unknown = JSON.parse(json);

    if (!contenu || typeof contenu !== 'object' || Array.isArray(contenu)) {
      return `catalogue ${langue} : le JSON n’est pas un objet`;
    }

    cles = Object.keys(contenu).length;
  } catch {
    return `catalogue ${langue} : JSON illisible`;
  }

  return cles < MINIMUM_DE_CLES[langue]
    ? `catalogue ${langue} : ${cles} clés, en dessous du minimum ${MINIMUM_DE_CLES[langue]}`
    : undefined;
}

/**
 * Une clé témoin prise dans le catalogue : la première qui vient d'un catalogue
 * de l'IDE (`chat.copy.…`) — précisément ce qu'une page marketing n'a aucune
 * raison de porter. `undefined` si le catalogue n'en a pas : le contrôle doit
 * alors le dire, pas conclure « rien trouvé ».
 */
export function cleTemoin(json: string): string | undefined {
  const contenu = JSON.parse(json) as Record<string, unknown>;

  return Object.keys(contenu).find((cle) => cle.startsWith('chat.copy.'));
}

export function chunksPortantLeTemoin(temoin: string, chunks: ReadonlyMap<string, string>): string[] {
  const marqueur = `"${temoin}"`;

  return [...chunks].filter(([, code]) => code.includes(marqueur)).map(([nom]) => nom);
}
