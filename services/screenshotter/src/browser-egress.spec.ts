import type { Route } from 'playwright-core';
import { describe, expect, it, vi } from 'vitest';
import { guardScreenshotRoute } from './browser.js';

function request(url: string) {
  const route = {
    request: () => ({ url: () => url, headers: () => ({ accept: '*/*' }) }),
    continue: vi.fn(async () => undefined),
    fetch: vi.fn(async () => ({
      status: () => 200,
      headers: () => ({}) as Record<string, string>,
      dispose: vi.fn(async () => undefined),
    })),
    fulfill: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
  };

  return { ...route, route: route as unknown as Route };
}

describe('capture : admission des documents et sous-ressources HTTP', () => {
  it.each(['http://127.0.0.1/private', 'http://169.254.169.254/metadata', 'http://[::ffff:a9fe:a9fe]/metadata'])(
    'refuse une sous-ressource privée littérale %s',
    async (url) => {
      const r = request(url);
      const resolveHost = vi.fn(async () => ['93.184.216.34']);
      await guardScreenshotRoute(r.route, { resolveHost });
      expect(r.abort).toHaveBeenCalledOnce();
      expect(r.continue).not.toHaveBeenCalled();
      expect(resolveHost).not.toHaveBeenCalled();
    },
  );

  it('refuse un domaine extérieur qui résout vers le réseau privé', async () => {
    const r = request('https://asset.example/private');
    const resolveHost = vi.fn(async () => ['10.0.0.7']);
    await guardScreenshotRoute(r.route, { resolveHost });
    expect(resolveHost).toHaveBeenCalledWith('asset.example');
    expect(r.abort).toHaveBeenCalledOnce();
    expect(r.continue).not.toHaveBeenCalled();
  });

  it('témoin : laisse passer la ressource publique et contrôle réellement son DNS', async () => {
    const r = request('https://cdn.example/asset.css');
    const resolveHost = vi.fn(async () => ['93.184.216.34']);
    await guardScreenshotRoute(r.route, { resolveHost });
    expect(resolveHost).toHaveBeenCalledWith('cdn.example');
    expect(r.continue).toHaveBeenCalledOnce();
    expect(r.abort).not.toHaveBeenCalled();
  });

  it('une résolution en échec ne redonne jamais le passage', async () => {
    const r = request('https://asset.example/asset.js');
    await guardScreenshotRoute(r.route, {
      resolveHost: async () => {
        throw new Error('DNS failed');
      },
    });
    expect(r.abort).toHaveBeenCalledOnce();
    expect(r.continue).not.toHaveBeenCalled();
  });

  it('préserve le proxy configuré, le Host et la recherche de l’aperçu', async () => {
    const r = request('http://ws.preview.example/file.js?v=2');
    const resolveHost = vi.fn(async () => ['10.0.0.7']);
    await guardScreenshotRoute(r.route, {
      previewProxyUrl: 'http://preview-proxy:3020',
      previewHostSuffixes: ['preview.example'],
      resolveHost,
    });
    expect(r.fetch).toHaveBeenCalledExactlyOnceWith({
      url: 'http://preview-proxy:3020/file.js?v=2',
      headers: { accept: '*/*', host: 'ws.preview.example' },
      maxRedirects: 0,
    });
    expect(resolveHost).not.toHaveBeenCalled();
    expect(r.abort).not.toHaveBeenCalled();
  });

  it('un routage de proxy échoué est fermé, sans second essai vers l’origine', async () => {
    const r = request('http://ws.preview.example/file.js');
    r.fetch.mockRejectedValue(new Error('routing failed'));
    await guardScreenshotRoute(r.route, {
      previewProxyUrl: 'http://preview-proxy:3020',
      previewHostSuffixes: ['preview.example'],
    });
    expect(r.fetch).toHaveBeenCalledOnce();
    expect(r.continue).not.toHaveBeenCalled();
    expect(r.abort).toHaveBeenCalledOnce();
  });
});
