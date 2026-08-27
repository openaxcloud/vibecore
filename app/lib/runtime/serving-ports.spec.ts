/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { anyPortServing, fetchAnyPortServing } from './serving-ports';

/*
 * BUG-RUNTIME-DIVERGENCE — le magasin client `previews` est VIDE au montage
 * alors que le serveur répond `serving: true` au même instant.
 *
 * Mesuré à l'écran, à l'instant exact de la décision :
 *   reused:true seededThisSession:true portProbeSucceeded:true ports: Array(0)
 * et côté serveur, en continu :
 *   [{ port: 5173, type:'open', processId:'…', serving:true }]
 *
 * `setRuntime()` remet `previews` à `[]` à chaque configuration de l'adaptateur
 * et relance `watchPorts` en fire-and-forget ; la décision tombe dans cette
 * fenêtre. La décision interroge donc désormais la source d'autorité.
 */

function response(body: unknown, ok = true) {
  return { ok, json: async () => body } as unknown as Response;
}

describe('anyPortServing — quel signal fait foi', () => {
  it('`serving` fait foi quand il est présent, même si `ready` le contredit', () => {
    // Le cas mesuré : ready:false parce que le manager retarde, alors que le port sert.
    expect(anyPortServing([{ port: 5173, ready: false, serving: true }] as never)).toBe(true);

    // L'inverse doit valoir aussi : `serving` est la réponse, pas un assouplissement.
    expect(anyPortServing([{ port: 5173, ready: true, serving: false }] as never)).toBe(false);
  });

  it('retombe sur `ready` quand `serving` est absent (runtime plus ancien)', () => {
    expect(anyPortServing([{ ready: true }] as never)).toBe(true);
    expect(anyPortServing([{ ready: undefined }] as never)).toBe(true);
    expect(anyPortServing([{ ready: false }] as never)).toBe(false);
  });

  it('vrai dès qu_UN port sert', () => {
    expect(anyPortServing([{ serving: false }, { serving: true }] as never)).toBe(true);
  });

  it('aucun port = faux', () => {
    expect(anyPortServing([])).toBe(false);
  });
});

describe('fetchAnyPortServing — distinguer « rien ne sert » de « je n_ai pas pu demander »', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lit la source serveur et rend vrai quand un port sert', async () => {
    const fetchMock = vi.fn(async () => response({ data: { ports: [{ port: 5173, ready: false, serving: true }] } }));

    await expect(fetchAnyPortServing('p1', fetchMock as never)).resolves.toBe(true);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/ide-panel/ports');
  });

  it('rend FAUX quand le serveur dit qu_aucun port ne sert', async () => {
    const fetchMock = vi.fn(async () => response({ data: { ports: [] } }));

    await expect(fetchAnyPortServing('p1', fetchMock as never)).resolves.toBe(false);
  });

  it('rend UNDEFINED sur une réponse non-ok — pas `false`', async () => {
    /*
     * La distinction porte tout le correctif : confondre « je n'ai pas pu
     * demander » avec « rien ne tourne » est exactement le défaut d'origine.
     */
    const fetchMock = vi.fn(async () => response({}, false));

    await expect(fetchAnyPortServing('p1', fetchMock as never)).resolves.toBeUndefined();
  });

  it('rend UNDEFINED quand la charge utile est malformée', async () => {
    await expect(fetchAnyPortServing('p1', (async () => response({ data: {} })) as never)).resolves.toBeUndefined();
    await expect(
      fetchAnyPortServing('p1', (async () => response({ data: { ports: 'nope' } })) as never),
    ).resolves.toBeUndefined();
  });

  it('rend UNDEFINED (ne lève jamais) quand le réseau échoue', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network');
    });

    await expect(fetchAnyPortServing('p1', fetchMock as never)).resolves.toBeUndefined();
  });

  it("encode l'identifiant de projet", async () => {
    const fetchMock = vi.fn(async () => response({ data: { ports: [] } }));

    await fetchAnyPortServing('a/b', fetchMock as never);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('a%2Fb');
  });
});
