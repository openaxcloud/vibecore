/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiRuntimeRoutesEn,
  apiRuntimeRoutesFr,
  formatApiRuntimeRoutesCopy,
  getApiRuntimeRoutesCopy,
} from '~/lib/i18n/catalogs/api-runtime-routes';

const { requireSessionMock, resolveConnectorTokenMock } = vi.hoisted(() => ({
  requireSessionMock: vi.fn(),
  resolveConnectorTokenMock: vi.fn(),
}));

vi.mock('~/lib/.server/require-session', () => ({
  requireWebSession: requireSessionMock,
}));

vi.mock('~/lib/connectors/connector-token.server', () => ({
  resolveConnectorToken: resolveConnectorTokenMock,
}));

type RouteData = {
  data: unknown;
  init?: { headers?: HeadersInit; status?: number } | number;
  type: 'DataWithResponseInit';
};

function routeData(value: unknown): RouteData {
  expect((value as RouteData)?.type).toBe('DataWithResponseInit');

  return value as RouteData;
}

function routeHeaders(value: RouteData): Headers {
  const init = typeof value.init === 'number' ? undefined : value.init;

  return new Headers(init?.headers);
}

describe('API/runtime route i18n catalog', () => {
  it('keeps exact English/French key parity and English fallback', () => {
    expect(Object.keys(apiRuntimeRoutesFr).sort()).toEqual(Object.keys(apiRuntimeRoutesEn).sort());
    expect(getApiRuntimeRoutesCopy('fr')).toBe(apiRuntimeRoutesFr);
    expect(getApiRuntimeRoutesCopy('de')).toBe(apiRuntimeRoutesEn);
  });

  it('localizes generated database-backup names without changing their ISO timestamp', () => {
    const timestamp = '2026-08-05T12:34:56.000Z';

    expect(formatApiRuntimeRoutesCopy(apiRuntimeRoutesFr['apiRuntime.panel.databaseBackupName'], { timestamp })).toBe(
      `Sauvegarde de la base de données ${timestamp}`,
    );
    expect(formatApiRuntimeRoutesCopy(apiRuntimeRoutesEn['apiRuntime.panel.databaseBackupName'], { timestamp })).toBe(
      `Database backup ${timestamp}`,
    );
  });
});

describe('localized route contracts', () => {
  beforeEach(() => {
    requireSessionMock.mockReset();
    requireSessionMock.mockResolvedValue('session-token');
    resolveConnectorTokenMock.mockReset();
    resolveConnectorTokenMock.mockResolvedValue(undefined);
    vi.restoreAllMocks();
  });

  it('localizes WebContainer preview validation and iframe accessibility copy', async () => {
    const { loader } = await import('./webcontainer.preview.$id');
    const request = new Request('https://e-code.ai/webcontainer/preview?lang=fr');

    let missingIdResponse: Response | undefined;

    try {
      await loader({ request, params: {}, context: {} } as never);
    } catch (error) {
      missingIdResponse = error as Response;
    }

    expect(missingIdResponse).toBeInstanceOf(Response);
    expect(missingIdResponse?.status).toBe(400);
    expect(missingIdResponse?.headers.get('Content-Language')).toBe('fr');
    expect(await missingIdResponse?.text()).toBe('Un identifiant d’aperçu est obligatoire.');

    const result = routeData(await loader({ request, params: { id: 'preview-123' }, context: {} } as never));

    expect(result.data).toEqual({ previewId: 'preview-123', frameTitle: 'Aperçu WebContainer' });
    expect(routeHeaders(result).get('Content-Language')).toBe('fr');
  });

  it('returns French validation for web search and bug reports', async () => {
    const [{ action: webSearchAction }, { action: bugReportAction }] = await Promise.all([
      import('./api.web-search'),
      import('./api.bug-report'),
    ]);

    const webResult = routeData(
      await webSearchAction({
        request: new Request('https://e-code.ai/api/web-search?lang=fr', { method: 'GET' }),
        params: {},
        context: {},
      } as never),
    );
    expect(webResult.data).toMatchObject({ code: 'METHOD_NOT_ALLOWED', error: 'Méthode non autorisée.' });
    expect(routeHeaders(webResult).get('Content-Language')).toBe('fr');

    const bugResult = routeData(
      await bugReportAction({
        request: new Request('https://e-code.ai/api/bug-report?lang=fr', {
          method: 'POST',
          body: new FormData(),
        }),
        params: {},
        context: {},
      } as never),
    );
    expect(bugResult.data).toMatchObject({ code: 'INVALID_INPUT' });
    expect(JSON.stringify(bugResult.data)).toContain('Vérifiez les champs');
    expect(JSON.stringify(bugResult.data)).not.toContain('Title is required');
    expect(routeHeaders(bugResult).get('Content-Language')).toBe('fr');
  });

  it('masks Supabase upstream details while preserving status and locale', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'internal database host and secret token' }), {
        status: 502,
        statusText: 'Bad Gateway',
      }),
    );

    const { action } = await import('./api.supabase.query');

    const response = await action({
      request: new Request('https://e-code.ai/api/supabase/query?lang=fr', {
        method: 'POST',
        headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'project-123', query: 'select 1' }),
      }),
      params: {},
      context: {},
    } as never);

    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get('Content-Language')).toBe('fr');
    expect(payload).toMatchObject({ error: { code: 'SUPABASE_QUERY_FAILED' } });
    expect(JSON.stringify(payload)).toContain('Supabase n’a pas pu exécuter');
    expect(JSON.stringify(payload)).not.toContain('internal database host');
    expect(JSON.stringify(payload)).not.toContain('secret token');

    const renderedLogs = JSON.stringify(consoleSpy.mock.calls);
    expect(renderedLogs).toContain('SUPABASE_QUERY_UPSTREAM_FAILED');
    expect(renderedLogs).not.toContain('internal database host');
    expect(renderedLogs).not.toContain('secret token');
  });

  it('localizes LLM/enhancer malformed bodies and never exposes implementation errors', async () => {
    const [{ action: llmAction }, { action: enhancerAction }] = await Promise.all([
      import('./api.llmcall'),
      import('./api.enhancer'),
    ]);
    const request = (path: string) =>
      new Request(`https://e-code.ai${path}?lang=fr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid',
      });

    for (const [path, action] of [
      ['/api/llmcall', llmAction],
      ['/api/enhancer', enhancerAction],
    ] as const) {
      try {
        await action({ request: request(path), params: {}, context: { cloudflare: { env: {} } } } as never);
        throw new Error('EXPECTED_ROUTE_ERROR');
      } catch (error) {
        expect(error).toBeInstanceOf(Response);
        expect((error as Response).status).toBe(400);
        expect((error as Response).headers.get('Content-Language')).toBe('fr');
        expect(await (error as Response).text()).toBe('Le corps de la requête doit contenir un JSON valide.');
      }
    }
  });

  it('localizes IDE panel route errors with a stable code and Content-Language', async () => {
    const { loader } = await import('./api.projects.$projectId.ide-panel.$panel');

    try {
      await loader({
        request: new Request('https://e-code.ai/api/projects/missing/ide-panel?lang=fr'),
        params: {},
        context: {},
      } as never);
      throw new Error('EXPECTED_ROUTE_ERROR');
    } catch (error) {
      const result = routeData(error);
      expect(result.data).toEqual({
        error: 'Le panneau du projet est introuvable.',
        code: 'PANEL_NOT_FOUND',
      });
      expect(routeHeaders(result).get('Content-Language')).toBe('fr');
    }
  });
});
