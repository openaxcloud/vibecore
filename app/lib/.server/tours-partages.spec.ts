import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// eslint-disable-next-line no-restricted-imports -- test de CONTRAT : il doit exécuter le vrai lecteur de l'API, de l'autre côté de la frontière
import { toursEnCoursDuProjet } from '../../../services/api/src/tours-partages';
import { registreDesTours } from './tours-en-cours';
import { annoncerUnTourPartage, avecSuiviDuTourPartage } from './tours-partages.server';

/*
 * LE CONTRAT ENTRE DEUX PROCESSUS. Le pod web annonce ses tours ; l'API, qui
 * publie, les lit pour décider si elle peut mettre un espace en veille. Si les
 * deux côtés divergent (clé, borne, format), l'API lirait « aucun tour » pendant
 * un tour — et couperait le travail de l'utilisateur. Ce test fait parler le VRAI
 * code des deux côtés, sur un Redis réel.
 *
 * Redis : celui de la CI (`REDIS_URL`, service de ci.yml). Sauté en local sans
 * lui ; rouge en CI s'il manque.
 */

const redisUrl = process.env.REDIS_URL;

if (process.env.CI && !redisUrl) {
  throw new Error('REDIS_URL absent en CI : le contrat web ↔ API ne serait pas mesuré.');
}

describe.runIf(redisUrl)('tours partagés : ce que le pod web annonce, l’API le lit', () => {
  let redis: Redis;

  beforeAll(async () => {
    redis = new Redis(redisUrl!, { lazyConnect: true, maxRetriesPerRequest: 1 });
    await redis.connect();
  });

  afterAll(() => {
    redis.disconnect();
  });

  it('un tour annoncé est vu par l’API, puis disparaît à sa fin', async () => {
    const projet = `contrat-${Date.now().toString(36)}`;

    expect(await toursEnCoursDuProjet(redis, projet)).toBe(0);

    const retirer = await annoncerUnTourPartage(projet, { redis });

    expect(await toursEnCoursDuProjet(redis, projet)).toBe(1);

    await retirer();

    expect(await toursEnCoursDuProjet(redis, projet)).toBe(0);
  });

  it('un tour oublié (pod mort) s’éteint avec la borne de #642 — il ne bloque pas au-delà', async () => {
    const projet = `oubli-${Date.now().toString(36)}`;

    await annoncerUnTourPartage(projet, { redis, maintenant: Date.now() - 16 * 60_000 });

    expect(await toursEnCoursDuProjet(redis, projet)).toBe(0);
  });

  it('l’enveloppe du chat garde le tour annoncé TANT QUE le travail court, et dans le registre local de #642', async () => {
    const projet = `enveloppe-${Date.now().toString(36)}`;

    let pendant: number | null = null;
    let localPendant = 0;

    await avecSuiviDuTourPartage(projet, async () => {
      pendant = await toursEnCoursDuProjet(redis, projet);
      localPendant = [...registreDesTours().values()].filter((tour) => tour.etiquette === `chat:${projet}`).length;
    })();

    expect(pendant).toBe(1);
    expect(localPendant).toBe(1);
    expect(await toursEnCoursDuProjet(redis, projet)).toBe(0);
  });
});

describe('sans Redis, un tour se déroule normalement — et l’API lit « on ne sait pas »', () => {
  it('l’annonce ne lève pas et ne bloque pas le tour', async () => {
    const retirer = await annoncerUnTourPartage('sans-redis', { redis: null });

    await expect(retirer()).resolves.toBeUndefined();
    expect(await toursEnCoursDuProjet(undefined, 'sans-redis')).toBeNull();
  });

  it('un Redis qui ne répond pas ne retarde pas le tour au-delà d’une seconde', async () => {
    const muet = { eval: () => new Promise<unknown>(() => undefined) };
    const debut = Date.now();

    await annoncerUnTourPartage('redis-muet', { redis: muet });

    expect(Date.now() - debut).toBeLessThan(1_500);
  });
});
