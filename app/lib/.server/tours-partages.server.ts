/**
 * LE REGISTRE DES TOURS DE #642, RECOPIÉ LÀ OÙ L'API PEUT LE LIRE.
 *
 * Décision d'Avi du 2026-10-01 : publier un projet d'un compte gratuit met en
 * veille son AUTRE espace de travail — sauf si cet espace a un tour d'agent en
 * cours, qu'il ne faut surtout pas interrompre (c'est le défaut que #642 vient de
 * réparer). Or le registre de #642 vit dans la mémoire de CE processus ; l'API,
 * qui publie, ne le voit pas. Chaque tour d'un projet est donc aussi annoncé dans
 * Redis, avec la même borne (`DUREE_MAX_D_UN_TOUR_MS`), et retiré à sa fin.
 *
 * Rien ici ne bloque ni ne fait échouer un tour : sans Redis, ou s'il est en
 * panne, le tour se déroule normalement. L'API lit alors « on ne sait pas » et
 * n'arrête rien (services/api/src/tours-partages.ts).
 */
import { avecSuiviDuTour, DUREE_MAX_D_UN_TOUR_MS } from '~/lib/.server/tours-en-cours';
import { getWebReferenceRateLimitRedis } from '~/lib/.server/web/rate-limit-redis.server';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('tours-partages');

/** Préfixe partagé avec l'API — tenu par `app/lib/.server/tours-partages.spec.ts`, qui fait parler les deux côtés. */
export const PREFIXE_TOURS_PARTAGES = 'tours-en-cours:';

export interface ClientRedisDesTours {
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
}

const SCRIPT_ANNONCER = `
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2])
redis.call('PEXPIRE', KEYS[1], ARGV[3])
return 1
`;

/*
 * Au-delà, le tour part sans annonce. Si l'annonce arrive quand même plus tard, elle
 * expire avec la borne : l'API attend alors pour rien, elle n'arrête jamais à tort.
 */
const DELAI_ANNONCE_MS = 1_000;

const SCRIPT_RETIRER = `return redis.call('ZREM', KEYS[1], ARGV[1])`;

/** Annonce un tour ; la fonction rendue le retire. Ne lève jamais. */
export async function annoncerUnTourPartage(
  projectId: string,
  options: { redis?: ClientRedisDesTours | null; maintenant?: number } = {},
): Promise<() => Promise<void>> {
  const redis = options.redis === undefined ? await getWebReferenceRateLimitRedis().catch(() => null) : options.redis;

  if (!redis) {
    return async () => undefined;
  }

  const cle = `${PREFIXE_TOURS_PARTAGES}${projectId}`;
  const membre = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const echeance = (options.maintenant ?? Date.now()) + DUREE_MAX_D_UN_TOUR_MS;

  let minuteur: ReturnType<typeof setTimeout> | undefined;

  try {
    // Borné : un Redis lent ne doit pas retarder le premier mot du tour.
    await Promise.race([
      redis.eval(SCRIPT_ANNONCER, 1, cle, echeance, membre, DUREE_MAX_D_UN_TOUR_MS),
      new Promise((_, rejeter) => {
        // Un code, pas une phrase : cette erreur n'est jamais montrée, seulement journalisée.
        minuteur = setTimeout(
          () => rejeter(Object.assign(new Error(), { code: 'TOUR_ANNONCE_DELAI_DEPASSE' })),
          DELAI_ANNONCE_MS,
        );
      }),
    ]);
  } catch (error) {
    // On retire quand même à la fin : une annonce arrivée en retard ne doit pas survivre au tour.
    logger.warn(
      JSON.stringify({
        event: 'tour-partage.annonce-echouee',
        projectId,
        raison: (error as { code?: string })?.code ?? String(error),
      }),
    );
  } finally {
    clearTimeout(minuteur);
  }

  return async () => {
    try {
      await redis.eval(SCRIPT_RETIRER, 1, cle, membre);
    } catch (error) {
      // L'échéance (quinze minutes) le retirera : un tour oublié ne bloque jamais au-delà.
      logger.warn(JSON.stringify({ event: 'tour-partage.retrait-echoue', projectId, raison: String(error) }));
    }
  };
}

/**
 * `avecSuiviDuTour` de #642, plus l'annonce partagée quand le tour porte sur un
 * projet. Le registre local reste la source de l'arrêt propre du pod.
 */
export function avecSuiviDuTourPartage<A extends unknown[], R>(
  projectId: string | undefined,
  travail: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return avecSuiviDuTour(`chat:${projectId ?? 'sans-projet'}`, async (...args: A) => {
    const retirer = projectId ? await annoncerUnTourPartage(projectId) : async () => undefined;

    try {
      return await travail(...args);
    } finally {
      await retirer();
    }
  });
}
