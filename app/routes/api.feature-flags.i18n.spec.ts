import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { loader } from './api.feature-flags';
import { action } from './api.feature-flags.$featureId.viewed';

function headersOf(result: unknown): Headers {
  return new Headers((result as { init?: { headers?: HeadersInit } }).init?.headers);
}

function dataOf<T>(result: unknown): T {
  return (result as { data: T }).data;
}

describe('feature announcements i18n API', () => {
  it('negotiates French from Accept-Language and emits locale headers', async () => {
    const result = await loader({
      request: new Request('https://app.test/api/feature-flags', {
        headers: { 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5' },
      }),
      params: {},
      context: {},
    });

    const features = dataOf<Array<{ name: string; description: string }>>(result);
    const headers = headersOf(result);

    expect(features[0]).toMatchObject({ name: 'Marketplace MCP' });
    expect(features[0].description).toContain('Parcourez et connectez');
    expect(headers.get('Content-Language')).toBe('fr');
    expect(headers.get('Vary')).toContain('Cookie');
    expect(headers.get('Vary')).toContain('Accept-Language');
  });

  it('gives the manual English cookie priority over browser French', async () => {
    const result = await loader({
      request: new Request('https://app.test/api/feature-flags', {
        headers: { Cookie: 'vibecore-lang=en', 'Accept-Language': 'fr-FR' },
      }),
      params: {},
      context: {},
    });

    expect(dataOf<Array<{ name: string }>>(result)[0].name).toBe('MCP marketplace');
    expect(headersOf(result).get('Content-Language')).toBe('en');
  });

  it('returns localized coded errors and persists known viewed ids', async () => {
    const request = new Request('https://app.test/api/feature-flags/unknown/viewed', {
      method: 'POST',
      headers: { 'Accept-Language': 'fr-FR' },
    });

    const unknown = await action({ request, params: { featureId: 'unknown' }, context: {} });

    expect((unknown as { init: { status: number } }).init.status).toBe(404);
    expect(dataOf<{ code: string; error: string; ok: boolean }>(unknown)).toEqual({
      ok: false,
      code: 'FEATURE_NOT_FOUND',
      error: 'La fonctionnalité demandée est introuvable.',
    });
    expect(headersOf(unknown).get('Content-Language')).toBe('fr');

    const known = await action({ request, params: { featureId: 'agent-panel' }, context: {} });
    const cookies = headersOf(known).getSetCookie();

    expect(dataOf(known)).toEqual({ ok: true });
    expect(cookies.some((cookie) => cookie.startsWith('vc_viewed_features='))).toBe(true);
  });

  it('has zero direct hardcoded-copy findings in the assigned executable sources', async () => {
    const { scanSource } = await import('../../scripts/i18n/source-scanner.mjs');

    const paths = [
      'app/lib/feature-announcements.server.ts',
      'app/routes/api.feature-flags.ts',
      'app/routes/api.feature-flags.$featureId.viewed.ts',
    ];

    for (const path of paths) {
      const scan = scanSource(await readFile(path, 'utf8'), path);
      expect(scan.parseErrors, path).toEqual([]);
      expect(scan.findings, path).toEqual([]);
    }
  });
});
