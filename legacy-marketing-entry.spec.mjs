import { readFileSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { legacyMarketingRedirect, redirectLegacyMarketingEntry } from './legacy-marketing-entry.mjs';

const root = fileURLToPath(new URL('./', import.meta.url));

let server;
let origin;

beforeAll(async () => {
  const app = express();
  app.use(redirectLegacyMarketingEntry);
  app.use(express.static(`${root}/public`));
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

describe('retired imported marketing SPA', () => {
  it.each([
    '/ecode-static',
    '//ecode-static/index.html',
    '///ecode-static/',
    '/ecode-static/',
    '/ecode-static/index.html',
    '/ecode-static/index',
    '/ecode-static/index/',
    '/ecode-static//index.html',
    '/ecode-static/index%2Ehtml',
    '/%65code-static/',
    '/ecode-static/index.html/',
  ])('redirects %s before static HTML is served', async (path) => {
    const response = await fetch(`${origin}${path}?lang=fr`, { redirect: 'manual' });
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/?lang=fr');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).not.toContain('<script');
  });

  it.each(['/ecode-static%5Cindex.html', '/%5Cecode-static/index.html'])(
    'never serves an executable entry through backslash encoding: %s',
    async (path) => {
      const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
      expect(response.status).not.toBe(200);
      expect(await response.text()).not.toContain('/ecode-static/assets/index-');
    },
  );

  it.each(['/\\ecode-static/index.html', '/ecode-static\\index.html', '\\ecode-static\\index.html'])(
    'does not serve the legacy entry for the raw HTTP target %s',
    async (path) => {
      const result = await new Promise((resolve, reject) => {
        const pending = request({ hostname: '127.0.0.1', port: server.address().port, path }, (response) => {
          let body = '';
          response.on('data', (chunk) => {
            body += chunk;
          });
          response.on('end', () => resolve({ status: response.statusCode, body }));
        });
        pending.on('error', reject);
        pending.end();
      });
      expect(result.status).not.toBe(200);
      expect(result.body).not.toContain('/ecode-static/assets/index-');
    },
  );

  it.each([
    '/ecode-static%2f.%2findex.html',
    '/ecode-static/%2e%2findex.html',
    '/ecode-static%2f..%2fecode-static%2findex.html',
    '/%65code-static%2f.%2findex.html',
  ])('redirects encoded dot segments in the raw HTTP target %s', async (path) => {
    const result = await new Promise((resolve, reject) => {
      const pending = request({ hostname: '127.0.0.1', port: server.address().port, path }, (response) => {
        let body = '';
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => resolve({ status: response.statusCode, location: response.headers.location, body }));
      });
      pending.on('error', reject);
      pending.end();
    });
    expect(result.status).toBe(302);
    expect(result.location).toBe('/');
    expect(result.body).not.toContain('/ecode-static/assets/index-');
  });

  it('preserves the real marketing images and stylesheet', async () => {
    const html = readFileSync(`${root}/public/ecode-static/index.html`, 'utf8');
    const stylesheet = html.match(/href="([^\"]+\.css)"/)[1];

    for (const path of ['/ecode-static/assets/product/dashboard.png', stylesheet]) {
      const response = await fetch(`${origin}${path}`);
      expect(response.status).toBe(200);

      const actual = Buffer.from(await response.arrayBuffer());
      expect(actual).toEqual(readFileSync(`${root}/public${path}`));
    }
  });

  it('does not capture native routes, assets or lookalike paths', () => {
    for (const path of [
      '/status',
      '/polyglot',
      '/ecode-static/assets/image.png',
      '/ecode-static/offline.html',
      '/ecode-static-other/',
      '/ecode-static/index.html.js',
      '/ecode-static/%zz',
    ]) {
      expect(legacyMarketingRedirect(path)).toBeNull();
    }
  });

  it('declares the standard entry redirects for static Pages serving', () => {
    const rules = readFileSync(`${root}/public/_redirects`, 'utf8').trim().split('\n');

    for (const path of [
      '/ecode-static',
      '/ecode-static/',
      '/ecode-static/index',
      '/ecode-static/index/',
      '/ecode-static/index.html',
      '/ecode-static/index.html/',
    ]) {
      expect(rules).toContain(`${path} / 302`);
    }
  });

  it('wires Node before static serving and packages its helper in the production image', () => {
    const source = readFileSync(`${root}/server.mjs`, 'utf8');
    expect(source.indexOf('app.use(redirectLegacyMarketingEntry)')).toBeLessThan(source.indexOf('express.static('));
    expect(source).toContain("from './legacy-marketing-entry.mjs'");
    expect(readFileSync(`${root}/Dockerfile`, 'utf8')).toContain(
      '/app/legacy-marketing-entry.mjs /app/legacy-marketing-entry.mjs',
    );
    expect(readFileSync(`${root}/vite.config.ts`, 'utf8')).toContain(
      'server.middlewares.use(redirectLegacyMarketingEntry)',
    );
  });
});
