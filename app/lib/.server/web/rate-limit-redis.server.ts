/**
 * Client Redis du plafond de lectures de sites, côté pod web.
 *
 * Un SEUL client pour tout le processus, créé paresseusement : ouvrir une
 * connexion par requête de chat ferait fondre le pool de Redis sous charge.
 *
 * `ioredis` est importé DYNAMIQUEMENT : un import statique de niveau module
 * ferait échouer le build client de vite (« externalized for browser
 * compatibility »), alors qu'un import à l'exécution reste dans le bundle SSR
 * et disparaît du bundle navigateur — même motif que `node:dns` dans
 * safe-fetch.ts.
 *
 * Sans `REDIS_URL`, on rend `null` : l'appelant retombe sur le compteur par pod
 * (plafond réel, seulement multiplié par le nombre de pods), il ne passe jamais
 * en « autorisé sans compter ».
 */
import type { WebReferenceRateLimitRedis } from './web-reference-rate-limit';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('web-reference');

let client: WebReferenceRateLimitRedis | null | undefined;
let pending: Promise<WebReferenceRateLimitRedis | null> | undefined;

function readRedisUrl(env?: Record<string, string | undefined> | null): string | undefined {
  const processEnv = typeof process !== 'undefined' ? process.env : undefined;
  const raw = env?.REDIS_URL ?? processEnv?.REDIS_URL;

  return raw && raw.trim() !== '' ? raw.trim() : undefined;
}

/** Test hook: oublie le client mémoïsé. */
export function resetWebReferenceRedis(): void {
  client = undefined;
  pending = undefined;
}

export async function getWebReferenceRateLimitRedis(
  env?: Record<string, string | undefined> | null,
): Promise<WebReferenceRateLimitRedis | null> {
  if (client !== undefined) {
    return client;
  }

  if (pending) {
    return pending;
  }

  const url = readRedisUrl(env);

  if (!url) {
    client = null;

    return null;
  }

  pending = (async () => {
    try {
      const ioredis = await import('ioredis');

      /*
       * `lazyConnect` : la connexion s'ouvre au premier `eval`, pas au montage
       * du module — un pod web doit démarrer même si Redis est momentanément
       * indisponible. `maxRetriesPerRequest: 1` borne l'attente : au-delà,
       * l'appelant retombe sur le compteur par pod plutôt que de faire patienter
       * l'utilisateur avant sa génération.
       */
      const instance = new ioredis.Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });

      /*
       * ioredis émet une 'error' de niveau processus sur toute faute de
       * connexion ; sans écouteur, elle devient une exception non gérée qui
       * tuerait le pod. On la journalise et on laisse le repli faire son
       * travail.
       */
      instance.on('error', (error: Error) => {
        logger.warn('web reference rate-limit redis error', { message: error?.message });
      });

      client = instance as unknown as WebReferenceRateLimitRedis;

      return client;
    } catch (error) {
      logger.warn('web reference rate-limit redis unavailable; per-pod counter only', {
        message: (error as Error)?.message,
      });
      client = null;

      return null;
    } finally {
      pending = undefined;
    }
  })();

  return pending;
}
