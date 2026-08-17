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

/*
 * Vignettes des PUBLICATIONS. L'API planifie aussi les captures des URL publiées :
 * ne router que `<ws>-<port>` laissait ces requêtes partir avec un Host que le
 * proxy ne route pas — la vignette d'une app publiée ne pouvait pas se prendre.
 */
describe('previewProxyPathUrl — publications d-/s-', () => {
  const proxy = new URL('http://preview-proxy.vibecore.svc:3020');
  const suffixes = ['preview.e-code.ai'];

  it('route un deploiement serveur d-<id> vers /d/<id>', () => {
    expect(previewProxyPathUrl(proxy, new URL('https://d-clx9k2m4p.preview.e-code.ai/'), suffixes)).toBe(
      'http://preview-proxy.vibecore.svc:3020/d/clx9k2m4p/',
    );
  });

  it('route une publication statique s-<id> vers /s/<id>', () => {
    expect(previewProxyPathUrl(proxy, new URL('https://s-clx9k2m4p.preview.e-code.ai/index.html'), suffixes)).toBe(
      'http://preview-proxy.vibecore.svc:3020/s/clx9k2m4p/index.html',
    );
  });

  it('preserve sous-chemin et query des sous-ressources publiees', () => {
    expect(
      previewProxyPathUrl(proxy, new URL('https://d-clx9k2m4p.preview.e-code.ai/assets/app.js?v=3'), suffixes),
    ).toBe('http://preview-proxy.vibecore.svc:3020/d/clx9k2m4p/assets/app.js?v=3');
  });

  /*
   * Le point qui rendait l'ordre des tests obligatoire : `d-clx9k2m4p` ne doit pas
   * être lu comme un workspace, et un `<ws>-<port>` ne doit pas être lu comme une
   * publication. Les deux grammaires cohabitent sur le même label.
   */
  it('ne confond pas une publication avec un workspace, ni l inverse', () => {
    // Publication : pas de port final, donc jamais /p/.
    const pub = previewProxyPathUrl(proxy, new URL('https://d-clx9k2m4p.preview.e-code.ai/'), suffixes);
    expect(pub).not.toContain('/p/');

    // Workspace dont l'identifiant COMMENCE par `d-` : c'est bien un preview.
    expect(previewProxyPathUrl(proxy, new URL('https://d-abc123-5173.preview.e-code.ai/'), suffixes)).toBe(
      'http://preview-proxy.vibecore.svc:3020/p/d-abc123/5173/',
    );
  });

  it('normalise la casse de l hote comme le fait le proxy', () => {
    /*
     * `new URL` met le nom d'hote en minuscules — et le proxy fait de meme avant
     * de parser. Un identifiant saisi en majuscules est donc VALIDE des deux
     * cotes : c'est la meme URL. Assertion posee explicitement pour que la
     * prochaine lecture ne croie pas a un trou de validation.
     */
    expect(previewProxyPathUrl(proxy, new URL('https://d-ABC123.preview.e-code.ai/'), suffixes)).toBe(
      'http://preview-proxy.vibecore.svc:3020/d/abc123/',
    );
  });

  it('refuse un identifiant de publication trop court ou hors grammaire', () => {
    // `parseDeployHost` cote proxy exige [a-z0-9]{6,} : en dessous, on ne devine pas.
    expect(previewProxyPathUrl(proxy, new URL('https://d-abc.preview.e-code.ai/'), suffixes)).toBeNull();
    // Prefixe autre que d-/s- : ni publication, ni preview (pas de port).
    expect(previewProxyPathUrl(proxy, new URL('https://x-clx9k2m4p.preview.e-code.ai/'), suffixes)).toBeNull();
  });
});
