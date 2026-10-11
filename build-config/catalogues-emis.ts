/**
 * BUG-PERF-I18N-RACINE-001 puis BUG-PERF-I18N-SURFACE-001 — ce que le build
 * doit avoir ÉMIS, lu sur l'artefact par `scripts/verifier-chemin-critique.ts`.
 *
 * Trois choses, parce que trois défauts distincts sont possibles :
 *   1. une tranche JSON absente — le navigateur hydraterait avec des
 *      « Unavailable » partout (la requête rend 404, l'entrée client hydrate
 *      quand même, par choix) ;
 *   2. un catalogue revenu dans un chunk JavaScript du chemin critique — le
 *      défaut du 2026-09-14 lui-même, que le cliquet d'octets ne verrait
 *      qu'une fois franchi. On cherche donc un TÉMOIN : une clé prise dans le
 *      JSON émis, qui ne doit apparaître dans aucun chunk de la racine ;
 *   3. depuis le 2026-09-15, le témoin ne doit pas non plus être dans la
 *      tranche `public` — c'est exactement le contrat du découpage par
 *      surface, et rien d'autre ne le tient sur l'artefact.
 */
export const LANGUES_EMISES = ['en', 'fr', 'es', 'ar'] as const;

export const SURFACES_EMISES = ['public', 'app'] as const;

export type LangueEmise = (typeof LANGUES_EMISES)[number];
export type SurfaceEmise = (typeof SURFACES_EMISES)[number];

/**
 * Les minimums viennent d'une mesure du découpage réel, arrondie bas en gardant
 * la même marge (~12 %). Un JSON de 12 clés serait un build qui a évalué le
 * mauvais module, pas un catalogue — c'est CELA que ce plancher attrape, et
 * rien d'autre : ce n'est pas un contrat sur le contenu de la tranche, qui est
 * tenu par `temoinDansLaTranchePublique`.
 *
 * Mesures, `node --import tsx` sur `cataloguesJson(RESOURCES)`, arbre propre :
 *   2026-09-15, avant le retrait d'`idePanels`  en/public 2 280 — plancher 2 000
 *   2026-09-16, après                           en/public 1 827 — plancher 1 600
 *
 * Le plancher a suivi parce que la livraison déplace délibérément 453 clés
 * d'`idePanels` de `public` vers `app` : l'ancienne valeur mesurait un
 * découpage qui n'existe plus. Le pouvoir de discrimination est inchangé — un
 * build qui évalue le mauvais module rend une douzaine de clés, pas 1 600.
 *
 * `es`/`ar` n'ont AUCUNE clé d'application : leur catalogue ne porte que les
 * 45 clés de langue, tout le reste vient du repli anglais. Leur minimum est
 * donc 0 — et c'est déclaré ici plutôt que déduit, pour qu'un futur ajout de
 * clés espagnoles ne fasse pas rougir une garde qui n'a rien à dire.
 */
export const MINIMUM_DE_CLES: Record<LangueEmise, Record<SurfaceEmise, number>> = {
  en: { public: 1_600, app: 8_000 },
  fr: { public: 1_600, app: 8_000 },
  es: { public: 40, app: 0 },
  ar: { public: 40, app: 0 },
};

export function fichierDuCatalogue(fichiers: readonly string[], langue: string, surface: string): string | undefined {
  const motif = new RegExp(`^catalogue-${langue}-${surface}-[0-9a-f]{10}\\.json$`);

  return fichiers.find((nom) => motif.test(nom));
}

/** Les tranches attendues, nommées `<langue>/<surface>` — 4 langues × 2 surfaces. */
export function cataloguesManquants(fichiers: readonly string[]): string[] {
  const manquants: string[] = [];

  for (const langue of LANGUES_EMISES) {
    for (const surface of SURFACES_EMISES) {
      if (fichierDuCatalogue(fichiers, langue, surface) === undefined) {
        manquants.push(`${langue}/${surface}`);
      }
    }
  }

  return manquants;
}

export function catalogueTropPetit(langue: LangueEmise, surface: SurfaceEmise, json: string): string | undefined {
  let cles: number;

  try {
    const contenu: unknown = JSON.parse(json);

    if (!contenu || typeof contenu !== 'object' || Array.isArray(contenu)) {
      return `catalogue ${langue}/${surface} : le JSON n’est pas un objet`;
    }

    cles = Object.keys(contenu).length;
  } catch {
    return `catalogue ${langue}/${surface} : JSON illisible`;
  }

  const minimum = MINIMUM_DE_CLES[langue][surface];

  return cles < minimum ? `catalogue ${langue}/${surface} : ${cles} clés, en dessous du minimum ${minimum}` : undefined;
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

/**
 * Le témoin dans la tranche PUBLIQUE : le découpage par surface aurait alors
 * livré le vocabulaire de l'IDE à la page d'accueil, sans qu'aucun octet du
 * chemin critique JavaScript ne bouge.
 */
export function temoinDansLaTranchePublique(temoin: string, jsonPublic: string): boolean {
  const contenu = JSON.parse(jsonPublic) as Record<string, unknown>;

  return Object.hasOwn(contenu, temoin);
}

export function chunksPortantLeTemoin(temoin: string, chunks: ReadonlyMap<string, string>): string[] {
  const marqueur = `"${temoin}"`;

  return [...chunks].filter(([, code]) => code.includes(marqueur)).map(([nom]) => nom);
}
