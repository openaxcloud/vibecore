/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getWebApiRoutesCopy,
  webApiErrorResponse,
  webApiRoutesEn,
  webApiRoutesFr,
} from '~/lib/i18n/catalogs/web-api-routes';

const { apiRequestMock, firstOrganizationOrNullMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  firstOrganizationOrNullMock: vi.fn(),
}));

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/enterprise-api.server')>();

  return {
    ...actual,
    apiRequest: apiRequestMock,
    firstOrganizationOrNull: firstOrganizationOrNullMock,
  };
});

async function payload(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe('web API route i18n contract', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockRejectedValue(new Response(JSON.stringify({ code: 'CONNECTOR_NOT_LINKED' }), { status: 401 }));
    firstOrganizationOrNullMock.mockReset();
    firstOrganizationOrNullMock.mockResolvedValue(null);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps exact English/French key parity and falls back to English', () => {
    expect(Object.keys(webApiRoutesFr).sort()).toEqual(Object.keys(webApiRoutesEn).sort());
    expect(getWebApiRoutesCopy('fr')).toBe(webApiRoutesFr);
    expect(getWebApiRoutesCopy('de')).toBe(webApiRoutesEn);
  });

  it('resolves the manual locale before Accept-Language and sets the response contract', async () => {
    const response = webApiErrorResponse(
      new Request('https://e-code.ai/api/example', {
        headers: {
          Cookie: 'vibecore-lang=fr',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      }),
      'GITHUB_REQUEST_FAILED',
      503,
    );

    expect(response.headers.get('Content-Language')).toBe('fr');
    expect(response.headers.get('Vary')).toContain('Cookie');
    expect(await payload(response)).toEqual({
      error: 'La requête GitHub n’a pas pu aboutir. Veuillez réessayer.',
      code: 'GITHUB_REQUEST_FAILED',
    });

    const englishResponse = webApiErrorResponse(
      new Request('https://e-code.ai/api/example', { headers: { 'Accept-Language': 'en-US' } }),
      'GITHUB_REQUEST_FAILED',
      503,
    );

    expect(englishResponse.headers.get('Content-Language')).toBe('en');
    expect(await payload(englishResponse)).toMatchObject({
      error: 'The GitHub request could not be completed. Please try again.',
      code: 'GITHUB_REQUEST_FAILED',
    });
  });

  it('localizes missing provider connections across GitHub, Netlify, Supabase, and Vercel', async () => {
    const requestFor = (path: string) =>
      new Request(`https://e-code.ai${path}`, { headers: { 'Accept-Language': 'fr-FR,fr;q=0.9' } });
    const routes = await Promise.all([
      import('./api.github-stats'),
      import('./api.github-user'),
      import('./api.netlify-user'),
      import('./api.supabase-user'),
      import('./api.vercel-user'),
    ]);

    for (const [index, route] of routes.entries()) {
      const paths = [
        '/api/github-stats',
        '/api/github-user',
        '/api/netlify-user',
        '/api/supabase-user',
        '/api/vercel-user',
      ];

      const response = await route.loader({ request: requestFor(paths[index]), params: {}, context: {} } as never);
      const body = await payload(response);

      expect(response.status).toBe(401);
      expect(response.headers.get('Content-Language')).toBe('fr');
      expect(body.error).toMatch(/Connectez/);
      expect(String(body.error)).not.toMatch(/token not found/i);
    }
  });

  it('returns a localized stable validation code from the branches route', async () => {
    const { action } = await import('./api.github-branches');

    const response = await action({
      request: new Request('https://e-code.ai/api/github-branches?lang=fr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: 'openaxcloud', repo: 'vibecore' }),
      }),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(400);
    expect(response.headers.get('Content-Language')).toBe('fr');
    expect(await payload(response)).toEqual({
      error: 'Un jeton GitHub est obligatoire.',
      code: 'GITHUB_TOKEN_REQUIRED',
    });
  });

  it('masks upstream GitHub template failures instead of serializing provider details', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('SECRET_PROVIDER_HOST: raw failure'));

    const { loader } = await import('./api.github-template');

    const response = await loader({
      request: new Request('https://e-code.ai/api/github-template?lang=fr&repo=xKevIsDev%2Fbolt-expo-template'),
      params: {},
      context: {},
    } as never);

    const body = await payload(response);

    expect(response.status).toBe(503);
    expect(response.headers.get('Content-Language')).toBe('fr');
    expect(body).toMatchObject({ code: 'GITHUB_TEMPLATE_FETCH_FAILED' });
    expect(JSON.stringify(body)).not.toContain('SECRET_PROVIDER_HOST');
    expect(JSON.stringify(body)).not.toContain('raw failure');
  });

  it('masks Git proxy exceptions and never echoes the target or implementation error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('PAT=secret and upstream host detail'));

    const { action } = await import('./api.git-proxy.$');

    const response = await action({
      request: new Request('https://e-code.ai/api/git-proxy/github.com/openaxcloud/vibecore?lang=fr', {
        method: 'GET',
        headers: { Cookie: 'vc_session=test-session' },
      }),
      params: { '*': 'github.com/openaxcloud/vibecore' },
      context: {},
    } as never);

    const body = await payload(response);

    expect(response.status).toBe(502);
    expect(response.headers.get('Content-Language')).toBe('fr');
    expect(body).toMatchObject({ code: 'GIT_PROXY_FAILED' });
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(JSON.stringify(body)).not.toContain('github.com/openaxcloud');
  });

  it('returns safe localized validation details for abuse reports', async () => {
    const { action } = await import('./api.report.abuse');

    const response = await action({
      request: new Request('https://e-code.ai/api/report/abuse?lang=fr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportType: 'other', targetUrl: 'not-a-url', description: 'short' }),
      }),
      params: {},
      context: {},
    } as never);

    const body = await payload(response);

    expect(response.status).toBe(400);
    expect(response.headers.get('Content-Language')).toBe('fr');
    expect(body).toMatchObject({ code: 'ABUSE_REPORT_INVALID' });
    expect(JSON.stringify(body)).not.toContain('Invalid url');
    expect(JSON.stringify(body)).not.toContain('String must contain');
  });

  it('localizes the abuse-report fallback email without altering submitted content', async () => {
    const { action } = await import('./api.report.abuse');
    const description = 'Contenu utilisateur à préserver intégralement dans le signalement.';

    const response = await action({
      request: new Request('https://e-code.ai/api/report/abuse?lang=fr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-real-ip': '198.51.100.42',
        },
        body: JSON.stringify({
          reportType: 'other',
          targetUrl: 'https://e-code.ai/u/example/project',
          description,
        }),
      }),
      params: {},
      context: { cloudflare: { env: {} } },
    } as never);

    const body = await payload(response);
    const mailto = decodeURIComponent(String(body.fallbackMailto));

    expect(response.status).toBe(503);
    expect(response.headers.get('Content-Language')).toBe('fr');
    expect(body).toMatchObject({ code: 'ABUSE_INTAKE_UNAVAILABLE' });
    expect(mailto).toContain('Type de signalement');
    expect(mailto).toContain('URL concernée');
    expect(mailto).toContain(description);
    expect(mailto).not.toContain('Report type:');
  });

  it('localizes invoice and template-project validation errors', async () => {
    const [{ loader: invoiceLoader }, { action: projectsAction }] = await Promise.all([
      import('./invoices_.download'),
      import('./api.projects'),
    ]);

    let invoiceResponse: Response | undefined;

    try {
      await invoiceLoader({
        request: new Request('https://e-code.ai/invoices/download?lang=fr'),
        params: {},
        context: {},
      } as never);
    } catch (error) {
      invoiceResponse = error as Response;
    }

    expect(invoiceResponse).toBeInstanceOf(Response);
    expect(invoiceResponse?.status).toBe(400);
    expect(invoiceResponse?.headers.get('Content-Language')).toBe('fr');
    expect(await payload(invoiceResponse as Response)).toMatchObject({
      code: 'INVOICE_ORGANIZATION_MISSING',
    });

    const projectResponse = await projectsAction({
      request: new Request('https://e-code.ai/api/projects?lang=fr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid',
      }),
      params: {},
      context: {},
    } as never);

    expect(projectResponse.status).toBe(400);
    expect(projectResponse.headers.get('Content-Language')).toBe('fr');
    expect(await payload(projectResponse)).toMatchObject({
      ok: false,
      code: 'TEMPLATE_PROJECT_PAYLOAD_INVALID',
    });
  });

  it('localizes deployment and provider validation across Vercel, Netlify, GitLab, and Supabase', async () => {
    const [vercel, netlify, gitlab, supabase, supabaseVariables] = await Promise.all([
      import('./api.vercel-deploy'),
      import('./api.netlify-deploy'),
      import('./api.gitlab-branches'),
      import('./api.supabase'),
      import('./api.supabase.variables'),
    ]);

    const frenchHeaders = { 'Accept-Language': 'fr-FR,fr;q=0.9', 'Content-Type': 'application/json' };

    const actionArgs = (path: string, body: Record<string, unknown>) => ({
      request: new Request(`https://e-code.ai${path}`, {
        method: 'POST',
        headers: frenchHeaders,
        body: JSON.stringify(body),
      }),
      params: {},
      context: {},
    });

    const responses = await Promise.all([
      vercel.loader({
        request: new Request('https://e-code.ai/api/vercel-deploy', { headers: frenchHeaders }),
        params: {},
        context: {},
      } as never),
      vercel.action(actionArgs('/api/vercel-deploy', { files: {}, chatId: 'chat' }) as never),
      netlify.action(actionArgs('/api/netlify-deploy', { files: {}, chatId: 'chat' }) as never),
      gitlab.action(actionArgs('/api/gitlab-branches', {}) as never),
      supabase.action(actionArgs('/api/supabase', {}) as never),
      supabaseVariables.action(actionArgs('/api/supabase/variables', { token: 'test-token' }) as never),
    ]);
    const expectedCodes = [
      'VERCEL_PROJECT_TOKEN_REQUIRED',
      'VERCEL_TOKEN_MISSING',
      'NETLIFY_TOKEN_MISSING',
      'GITLAB_TOKEN_REQUIRED',
      'SUPABASE_ACCESS_TOKEN_REQUIRED',
      'SUPABASE_PROJECT_TOKEN_REQUIRED',
    ];

    for (const [index, response] of responses.entries()) {
      expect(response.headers.get('Content-Language')).toBe('fr');
      expect(await payload(response)).toMatchObject({ code: expectedCodes[index] });
    }
  });

  it('masks raw Vercel and Netlify provider failures in localized deployment errors', async () => {
    const rawProviderError = 'SECRET_UPSTREAM_TOKEN=do-not-serialize';
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: rawProviderError } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: rawProviderError }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const [vercel, netlify] = await Promise.all([import('./api.vercel-deploy'), import('./api.netlify-deploy')]);

    const requestFor = (path: string) =>
      new Request(`https://e-code.ai${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept-Language': 'fr' },
        body: JSON.stringify({ token: 'test-token', files: {}, chatId: 'chat' }),
      });

    const vercelResponse = await vercel.action({
      request: requestFor('/api/vercel-deploy'),
      params: {},
      context: {},
    } as never);
    const netlifyResponse = await netlify.action({
      request: requestFor('/api/netlify-deploy'),
      params: {},
      context: {},
    } as never);

    for (const [response, code] of [
      [vercelResponse, 'VERCEL_PROJECT_CREATE_FAILED'],
      [netlifyResponse, 'NETLIFY_SITE_CREATE_FAILED'],
    ] as const) {
      const body = await payload(response);
      expect(response.headers.get('Content-Language')).toBe('fr');
      expect(body).toMatchObject({ code });
      expect(JSON.stringify(body)).not.toContain(rawProviderError);
    }
  });
});
