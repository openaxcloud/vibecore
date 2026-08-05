import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  adminOauthProvidersEn,
  adminOauthProvidersFr,
  formatAdminOauthProviderCount,
  getAdminOauthProviderName,
  getAdminOauthProvidersCopy,
  isAdminOauthProvider,
  resolveAdminOauthErrorCode,
} from './admin-oauth-providers';

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

function apiError(status: number, error: string, code?: string): Response {
  return new Response(JSON.stringify({ error, code }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('admin OAuth providers EN/FR catalog', () => {
  it('keeps strict flat key, non-empty value and interpolation parity', () => {
    expect(Object.keys(adminOauthProvidersFr).sort()).toEqual(Object.keys(adminOauthProvidersEn).sort());

    for (const key of Object.keys(adminOauthProvidersEn) as Array<keyof typeof adminOauthProvidersEn>) {
      expect(typeof adminOauthProvidersEn[key], key).toBe('string');
      expect(adminOauthProvidersEn[key].trim().length, key).toBeGreaterThan(0);
      expect(adminOauthProvidersFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(adminOauthProvidersFr[key]), key).toEqual(
        interpolationTokens(adminOauthProvidersEn[key]),
      );
    }
  });

  it('uses reviewed French OAuth administration terminology and English fallback', () => {
    const french = getAdminOauthProvidersCopy('fr-FR');

    expect(french['adminOauth.page.title']).toBe('Fournisseurs OAuth');
    expect(french['adminOauth.field.clientId']).toBe('Identifiant client');
    expect(french['adminOauth.field.clientSecret']).toBe('Secret client');
    expect(french['adminOauth.section.apikey.title']).toContain('clé API');
    expect(getAdminOauthProvidersCopy('de-DE')['adminOauth.page.title']).toBe('OAuth providers');
  });

  it('formats provider counts with French Intl plural and number rules', () => {
    expect(formatAdminOauthProviderCount(1, 'fr')).toBe('1 fournisseur');
    expect(formatAdminOauthProviderCount(2, 'fr')).toBe('2 fournisseurs');
    expect(formatAdminOauthProviderCount(1234, 'fr')).toBe('1 234 fournisseurs');
  });

  it('validates provider IDs without translating or rewriting them', () => {
    expect(isAdminOauthProvider('login', 'github')).toBe(true);
    expect(isAdminOauthProvider('login', 'gitlab')).toBe(false);
    expect(isAdminOauthProvider('connector', 'gitlab')).toBe(true);
    expect(isAdminOauthProvider('apikey', 'supabase')).toBe(true);
  });

  it('localizes known brands and masks raw API display prose in French', () => {
    expect(getAdminOauthProviderName('login', 'github', 'fr')).toBe('GitHub (connexion)');
    expect(getAdminOauthProviderName('connector', 'gitlab', 'fr')).toBe('GitLab');
    expect(getAdminOauthProviderName('apikey', 'vercel', 'fr')).toBe('Vercel');
    expect(getAdminOauthProviderName('connector', 'future-provider', 'fr')).toBe('future-provider');
    expect(getAdminOauthProviderName('connector', 'Unsafe English provider prose!', 'fr')).toBe('Fournisseur inconnu');
  });

  it('maps API failures to safe codes without returning raw prose', async () => {
    const rawMessage = 'Backend rejected tenant secret abc123';

    await expect(resolveAdminOauthErrorCode(apiError(400, rawMessage), 'save')).resolves.toBe('invalidConfiguration');
    await expect(resolveAdminOauthErrorCode(apiError(403, rawMessage, 'ADMIN_REAUTH_REQUIRED'), 'save')).resolves.toBe(
      'reauthExpired',
    );
    await expect(
      resolveAdminOauthErrorCode(apiError(403, rawMessage, 'PLATFORM_ADMIN_REQUIRED'), 'save'),
    ).resolves.toBe('platformAdminRequired');
    await expect(resolveAdminOauthErrorCode(apiError(401, rawMessage), 'reauth')).resolves.toBe('incorrectPassword');
    await expect(resolveAdminOauthErrorCode(apiError(429, rawMessage), 'save')).resolves.toBe('rateLimited');
    await expect(resolveAdminOauthErrorCode(new Error(rawMessage), 'save')).resolves.toBe('serviceUnavailable');
  });

  it('has zero hardcoded-copy scanner findings in the rendered route', async () => {
    const file = 'app/routes/admin.oauth-providers.tsx';
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(readFileSync(file, 'utf8'), file);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
  });
});
