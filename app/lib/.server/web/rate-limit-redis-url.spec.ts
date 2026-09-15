import { describe, expect, it, vi } from 'vitest';

import { readRedisUrl } from './rate-limit-redis.server';

/*
 * BUG-REDIS-URL-GUILLEMETS-001, troisième paquet.
 *
 * Mesuré avec `ioredis` réel le 2026-09-10 :
 *
 *     new Redis('redis://127.0.0.1:56379')    -> host=127.0.0.1   port=56379
 *     new Redis('"redis://127.0.0.1:56379"')  -> host="localhost" port=6379
 *
 * Une URL citée n'échoue pas : elle est REMPLACÉE. Ici le prix est précis — le
 * plafond de lectures de sites retombe sur le compteur par pod, et le correctif
 * « plafond partagé » redevient inerte sans qu'aucun test ne rougisse. C'est
 * exactement le défaut que le commentaire de ce fichier décrivait déjà pour une
 * AUTRE cause (`process.env` vide sous le polyfill) ; celle-ci est la seconde.
 */

vi.mock('~/lib/modules/llm/runtime-env', () => ({ readRuntimeEnv: () => undefined }));

describe('readRedisUrl', () => {
  it('retire une paire de guillemets doubles', () => {
    expect(readRedisUrl({ REDIS_URL: '"redis://h:6379"' })).toBe('redis://h:6379');
  });

  it('retire une paire de guillemets simples', () => {
    expect(readRedisUrl({ REDIS_URL: "'redis://h:6379'" })).toBe('redis://h:6379');
  });

  it('laisse une valeur saine intacte', () => {
    expect(readRedisUrl({ REDIS_URL: 'redis://h:6379' })).toBe('redis://h:6379');
  });

  it('coupe toujours les blancs, comme avant', () => {
    expect(readRedisUrl({ REDIS_URL: '  redis://h:6379  ' })).toBe('redis://h:6379');
    expect(readRedisUrl({ REDIS_URL: '  "redis://h:6379"  ' })).toBe('redis://h:6379');
  });

  it('rend `undefined` sur absent, vide, ou paire vide — l’appelant retombe sur le compteur par pod', () => {
    expect(readRedisUrl({})).toBeUndefined();
    expect(readRedisUrl({ REDIS_URL: '' })).toBeUndefined();
    expect(readRedisUrl({ REDIS_URL: '   ' })).toBeUndefined();
    expect(readRedisUrl({ REDIS_URL: '""' })).toBeUndefined();
  });

  it('ne touche PAS un guillemet orphelin — ce n’est pas le défaut mesuré', () => {
    expect(readRedisUrl({ REDIS_URL: '"redis://h:6379' })).toBe('"redis://h:6379');
    expect(readRedisUrl({ REDIS_URL: 'redis://h:6379"' })).toBe('redis://h:6379"');
  });

  it('ne touche pas des guillemets À L’INTÉRIEUR de la valeur', () => {
    expect(readRedisUrl({ REDIS_URL: 'redis://user:pa"ss@h:6379' })).toBe('redis://user:pa"ss@h:6379');
  });

  it('une paire dépareillée n’est pas une paire', () => {
    expect(readRedisUrl({ REDIS_URL: '"redis://h:6379\'' })).toBe('"redis://h:6379\'');
  });
});
