import { describe, expect, it } from 'vitest';

import { previewProxyPathUrl } from './preview-proxy-path';

/*
 * La sémantique doit rester CELLE de `parsePreviewHost`
 * (services/preview-proxy/src/app.ts), qui est le consommateur de ce qu'on
 * produit : si les deux divergent, le screenshotter fabrique des chemins que le
 * proxy refuse de router.
 */
describe('previewProxyPathUrl', () => {
  const proxy = new URL('http://preview-proxy.vibecore.svc:3020');
  const suffixes = ['preview.e-code.ai'];

  it('porte workspace + port dans le CHEMIN, pas dans Host', () => {
    expect(previewProxyPathUrl(proxy, new URL('https://ws-abc-5173.preview.e-code.ai/'), suffixes)).toBe(
      'http://preview-proxy.vibecore.svc:3020/p/ws-abc/5173/',
    );
  });

  it('preserve le sous-chemin et la query des sous-ressources', () => {
    expect(
      previewProxyPathUrl(proxy, new URL('http://ws-abc-5173.preview.e-code.ai/assets/app.js?v=2'), suffixes),
    ).toBe('http://preview-proxy.vibecore.svc:3020/p/ws-abc/5173/assets/app.js?v=2');
  });

  it('accepte plusieurs suffixes configures', () => {
    const many = ['preview.e-code.ai', 'preview.34.163.208.161.sslip.io'];
    expect(previewProxyPathUrl(proxy, new URL('http://w1-3000.preview.34.163.208.161.sslip.io/x'), many)).toBe(
      'http://preview-proxy.vibecore.svc:3020/p/w1/3000/x',
    );
  });

  it('refuse un hote hors suffixe (jamais de cible devinee)', () => {
    expect(previewProxyPathUrl(proxy, new URL('https://evil.example.com/'), suffixes)).toBeNull();
    expect(previewProxyPathUrl(proxy, new URL('https://app.e-code.ai/'), suffixes)).toBeNull();
  });

  it('refuse un label multi-niveaux — un hote de preview est UN seul label', () => {
    expect(previewProxyPathUrl(proxy, new URL('https://a.ws-abc-5173.preview.e-code.ai/'), suffixes)).toBeNull();
  });

  it('refuse un label sans port, ou avec un port hors bornes', () => {
    expect(previewProxyPathUrl(proxy, new URL('https://ws-abc.preview.e-code.ai/'), suffixes)).toBeNull();
    expect(previewProxyPathUrl(proxy, new URL('https://ws-abc-0.preview.e-code.ai/'), suffixes)).toBeNull();
    expect(previewProxyPathUrl(proxy, new URL('https://ws-abc-99999.preview.e-code.ai/'), suffixes)).toBeNull();
  });

  it('produit un identifiant de workspace sur UN seul segment de chemin', () => {
    /*
     * Un nom d'hôte ne peut pas contenir de séparateur de chemin — `new URL`
     * refuse même de parser `ws%2Fevil-5173.…`, donc l'injection de segment est
     * impossible par construction, et `encodeURIComponent` n'est ici qu'une
     * ceinture. Ce qui se teste utilement, c'est l'invariant observable : entre
     * `/p/` et le port, il y a exactement un segment.
     */
    const out = previewProxyPathUrl(proxy, new URL('https://ws-abc-def-5173.preview.e-code.ai/x'), suffixes);
    expect(out).toBe('http://preview-proxy.vibecore.svc:3020/p/ws-abc-def/5173/x');

    const between = new URL(out!).pathname.split('/').slice(2, -2);
    expect(between).toEqual(['ws-abc-def']);
  });

  it('tolere un suffixe configure avec des points superflus', () => {
    expect(previewProxyPathUrl(proxy, new URL('http://w-8080.preview.e-code.ai/'), ['.preview.e-code.ai.'])).toBe(
      'http://preview-proxy.vibecore.svc:3020/p/w/8080/',
    );
  });
});
