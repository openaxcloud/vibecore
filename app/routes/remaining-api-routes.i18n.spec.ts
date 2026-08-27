/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';

import {
  getRemainingApiRouteCopy,
  remainingApiErrorResponse,
  remainingApiRouteMessage,
  remainingApiRoutesEn,
  remainingApiRoutesFr,
} from '~/lib/i18n/catalogs/remaining-api-routes';

async function responsePayload(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe('remaining API routes i18n contract', () => {
  it('keeps exact English/French key parity and falls back to English', () => {
    expect(Object.keys(remainingApiRoutesFr).sort()).toEqual(Object.keys(remainingApiRoutesEn).sort());
    expect(getRemainingApiRouteCopy('fr-FR')).toBe(remainingApiRoutesFr);
    expect(getRemainingApiRouteCopy('es')).toBe(remainingApiRoutesEn);
    expect(getRemainingApiRouteCopy(undefined)).toBe(remainingApiRoutesEn);
  });

  it('gives the manual cookie priority over automatic detection and Accept-Language', async () => {
    const response = remainingApiErrorResponse(
      new Request('https://e-code.ai/api/example', {
        headers: {
          Cookie: 'vibecore-auto-lang=en; vibecore-lang=fr',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      }),
      'PROJECT_NOT_FOUND',
      404,
      { extra: { ok: false } },
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Language')).toBe('fr');
    expect(response.headers.get('Vary')).toContain('Cookie');
    expect(response.headers.get('Vary')).toContain('Accept-Language');
    expect(await responsePayload(response)).toEqual({
      ok: false,
      error: 'Le projet est introuvable.',
      code: 'PROJECT_NOT_FOUND',
    });
  });

  it('detects French from Accept-Language on the first request and persists the automatic choice', async () => {
    const response = remainingApiErrorResponse(
      new Request('https://e-code.ai/api/example', { headers: { 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5' } }),
      'METHOD_NOT_ALLOWED',
      405,
    );

    expect(response.headers.get('Content-Language')).toBe('fr');
    expect(response.headers.get('Set-Cookie')).toContain('vibecore-auto-lang=fr');
    expect(await responsePayload(response)).toMatchObject({
      error: 'Cette méthode de requête n’est pas prise en charge.',
      code: 'METHOD_NOT_ALLOWED',
    });
  });

  it('interpolates bounded technical values without translating them', () => {
    const request = new Request('https://e-code.ai/api/example?lang=fr');

    expect(remainingApiRouteMessage(request, 'OAUTH_PROVIDER_UNSUPPORTED', { provider: 'github-enterprise' })).toBe(
      'Le fournisseur « github-enterprise » n’est pas pris en charge.',
    );
    expect(remainingApiRouteMessage(request, 'SELF_REPAIR_PROMPT_TOO_LARGE', { maximum: 64_000 })).toContain(
      '64 000 octets',
    );
  });

  it('does not allow extra response data to overwrite the stable error contract', async () => {
    const response = remainingApiErrorResponse(
      new Request('https://e-code.ai/api/example?lang=fr'),
      'CONNECTOR_CONFIGURE_FAILED',
      502,
      {
        extra: {
          error: 'SECRET_UPSTREAM_EXCEPTION',
          code: 'RAW_PROVIDER_CODE',
          provider: 'github',
        },
      },
    );

    const body = await responsePayload(response);

    expect(body).toMatchObject({
      error: 'Impossible de configurer le connecteur. Veuillez réessayer.',
      code: 'CONNECTOR_CONFIGURE_FAILED',
      provider: 'github',
    });
    expect(JSON.stringify(body)).not.toContain('SECRET_UPSTREAM_EXCEPTION');
    expect(JSON.stringify(body)).not.toContain('RAW_PROVIDER_CODE');
  });
});
