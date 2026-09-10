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
import { readRuntimeEnv } from '~/lib/modules/llm/runtime-env';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('web-reference');

let client: WebReferenceRateLimitRedis | null | undefined;
let pending: Promise<WebReferenceRateLimitRedis | null> | undefined;

/*
 * `readRuntimeEnv`, JAMAIS `process.env` nu — le piège est déjà documenté dans
 * `app/lib/modules/llm/runtime-env.ts` et je suis tombé dedans.
 *
 * MESURÉ sur le build de production local, sonde dans cette fonction même :
 *
 *     {"event":"probe.redisUrl","envArg":"undefined","processHasKey":false,
 *      "processLen":0,"resolvedLen":0}
 *
 * alors que le processus qui sert la page portait bien `REDIS_URL` (longueur 23
 * dans `/proc/<pid>/environ`). `vite-plugin-node-polyfills`
 * (`vite.config.ts`, `globals.process = true`) injecte un `process` de
 * navigateur dans le bundle SSR, dont `env` est `{}` — une lecture nue rend
 * donc `undefined` dans le pod web même quand Kubernetes a posé la variable.
 * `globalThis.process` n'est PAS réécrit par le polyfill.
 *
 * Conséquence si on l'oublie : `getWebReferenceRateLimitRedis` rend `null`, le
 * plafond retombe sur le compteur par pod, et tout le correctif « plafond
 * partagé » est INERTE en production sans qu'aucun test ne rougisse.
 */
/*
 * BUG-REDIS-URL-GUILLEMETS-001 — une valeur CITÉE n'échoue pas : elle est JETÉE.
 *
 * Mesuré avec `ioredis` réel : `new Redis('"redis://127.0.0.1:56379"')` rend
 * `host="localhost" port=6379`. Le port configuré disparaît, et l'adresse de
 * repli est si banale qu'un exploitant qui la lit conclut que la variable n'est
 * pas posée. Elle l'est ; elle est ignorée.
 *
 * Ce lecteur coupait déjà les blancs — mais pas les guillemets, qui arrivent
 * quand un configmap ou un `.env` porte `REDIS_URL="redis://…"` et que la
 * valeur est passée VERBATIM au processus.
 *
 * Ici le prix de l'erreur est précis : le plafond partagé retombe silencieusement
 * sur le compteur par pod, et tout le correctif « plafond partagé » redevient
 * inerte — exactement le défaut décrit juste au-dessus, par un autre chemin.
 *
 * On ne retire QUE des guillemets APPARIÉS : un guillemet orphelin n'est pas ce
 * défaut, et on ne devine pas l'intention.
 */
/** Exporté pour sa garde : la règle vit dans une fonction pure, testable seule (règle 15). */
export function readRedisUrl(env?: Record<string, string | undefined> | null): string | undefined {
  const raw = (env?.REDIS_URL ?? readRuntimeEnv('REDIS_URL') ?? '').trim();

  if (raw === '') {
    return undefined;
  }

  const cite =
    raw.length >= 2 && ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")));

  if (!cite) {
    return raw;
  }

  const interieur = raw.slice(1, -1).trim();

  if (interieur !== '') {
    logger.warn(
      'REDIS_URL was wrapped in quotes; they were stripped. Left as-is, ioredis would have discarded the ' +
        'configured URL and fallen back to its default host and port. Fix the value at its source.',
    );
  }

  return interieur === '' ? undefined : interieur;
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
