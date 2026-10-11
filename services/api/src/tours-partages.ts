/**
 * LES TOURS DE GÉNÉRATION EN COURS, VUS DEPUIS L'API.
 *
 * #642 tient le registre des tours (`app/lib/.server/tours-en-cours.ts`) DANS LA
 * MÉMOIRE du pod web qui exécute le tour. L'API — qui publie — tourne dans un
 * autre processus, sur d'autres pods, et chaque réplique web a son propre
 * registre : elle ne peut pas le lire.
 *
 * Le pod web recopie donc chaque tour d'un projet dans Redis
 * (`app/lib/.server/tours-partages.server.ts`), sous la même borne de quinze
 * minutes que #642 ; on le lit ici. La règle de prudence est dans le type de
 * retour : `null` veut dire « on ne sait pas », et un appelant qui doit ARRÊTER
 * un espace ne le fait jamais sur un « on ne sait pas ».
 */

/** Préfixe de clé partagé avec le pod web — tenu par `app/lib/.server/tours-partages.spec.ts`, qui fait parler les deux côtés. */
export const PREFIXE_TOURS_PARTAGES = 'tours-en-cours:';

export function cleDesToursDuProjet(projectId: string): string {
  return `${PREFIXE_TOURS_PARTAGES}${projectId}`;
}

export interface LecteurRedisDesTours {
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
}

/*
 * Chaque membre a pour score son ÉCHÉANCE (début + 15 min). On purge les échus,
 * puis on compte : un tour oublié par un pod mort ne bloque jamais plus de
 * quinze minutes, exactement comme dans le registre local de #642.
 */
const SCRIPT_COMPTER = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
return redis.call('ZCARD', KEYS[1])
`;

/**
 * Nombre de tours en cours sur ce projet, ou `null` si on ne peut pas le savoir
 * (Redis absent ou en panne). Ne lève jamais.
 */
export async function toursEnCoursDuProjet(
  redis: LecteurRedisDesTours | undefined,
  projectId: string,
  maintenant: number = Date.now(),
): Promise<number | null> {
  if (!redis) {
    return null;
  }

  try {
    const compte = Number(await redis.eval(SCRIPT_COMPTER, 1, cleDesToursDuProjet(projectId), maintenant));

    return Number.isFinite(compte) && compte >= 0 ? compte : null;
  } catch {
    return null;
  }
}
