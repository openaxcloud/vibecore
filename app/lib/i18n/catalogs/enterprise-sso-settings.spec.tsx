import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  enterpriseSsoSettingsEn,
  enterpriseSsoSettingsFr,
  formatEnterpriseSsoDateTime,
  formatEnterpriseSsoGracePeriod,
  formatEnterpriseSsoNumber,
  getEnterpriseSsoSettingsCopy,
  localizeEnterpriseSsoCheck,
  normalizeEnterpriseSsoChecks,
  resolveEnterpriseSsoActionErrorCode,
} from './enterprise-sso-settings';

const technicalValuesKeptIdentical = [
  'enterpriseSso.oidc.issuerPlaceholder',
  'enterpriseSso.oidc.title',
  'enterpriseSso.saml.certificatePlaceholder',
  'enterpriseSso.saml.entityIdPlaceholder',
  'enterpriseSso.saml.ssoUrlPlaceholder',
  'enterpriseSso.saml.title',
] as const;

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

describe('enterprise SSO settings EN/FR catalog', () => {
  it('keeps strict key, interpolation and runtime-compatible flat-value parity', () => {
    expect(Object.keys(enterpriseSsoSettingsFr).sort()).toEqual(Object.keys(enterpriseSsoSettingsEn).sort());

    for (const key of Object.keys(enterpriseSsoSettingsEn) as Array<keyof typeof enterpriseSsoSettingsEn>) {
      expect(enterpriseSsoSettingsEn[key].trim().length, key).toBeGreaterThan(0);
      expect(enterpriseSsoSettingsFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(enterpriseSsoSettingsFr[key]), key).toEqual(
        interpolationTokens(enterpriseSsoSettingsEn[key]),
      );
    }

    const identicalValues = (Object.keys(enterpriseSsoSettingsEn) as Array<keyof typeof enterpriseSsoSettingsEn>)
      .filter((key) => enterpriseSsoSettingsEn[key] === enterpriseSsoSettingsFr[key])
      .sort();

    expect(identicalValues).toEqual([...technicalValuesKeptIdentical].sort());
  });

  it('uses reviewed French SSO terminology and falls back to English', () => {
    const french = getEnterpriseSsoSettingsCopy('fr-FR');

    expect(french['enterpriseSso.page.title']).toBe('Paramètres SSO d’entreprise');
    expect(french['enterpriseSso.oidc.clientId']).toBe('Identifiant client');
    expect(french['enterpriseSso.saml.entityId']).toBe('Identifiant d’entité');
    expect(french['enterpriseSso.enforcement.title']).toBe('Imposer le SSO');
    expect(getEnterpriseSsoSettingsCopy('de-DE')['enterpriseSso.page.title']).toBe('Enterprise SSO settings');
  });

  it('formats French dates, numbers and grace-period plurals through Intl', () => {
    expect(formatEnterpriseSsoNumber(1234567.5, 'fr')).toBe('1 234 567,5');
    expect(formatEnterpriseSsoDateTime('2026-08-04T12:30:00.000Z', 'fr')).toBe('4 août 2026, 12:30');
    expect(formatEnterpriseSsoGracePeriod(1, 'fr')).toContain('délai de grâce de 1 jour');
    expect(formatEnterpriseSsoGracePeriod(7, 'fr')).toContain('délai de grâce de 7 jours');
  });

  it('normalizes known server checks and localizes their dynamic diagnostics', () => {
    const checks = normalizeEnterpriseSsoChecks([
      {
        name: 'Discovery document',
        ok: false,
        detail: 'Discovery document is missing required fields: authorization_endpoint, jwks_uri.',
      },
      {
        name: 'SSO endpoint reachable',
        ok: true,
        detail: 'The SSO endpoint responded (HTTP redirect).',
      },
    ]);

    expect(checks).toEqual([
      {
        nameCode: 'discoveryDocument',
        detailCode: 'discoveryMissingFields',
        ok: false,
        values: { fields: 'authorization_endpoint, jwks_uri' },
      },
      {
        nameCode: 'ssoEndpointReachable',
        detailCode: 'ssoResponded',
        ok: true,
        values: { status: 'redirect' },
      },
    ]);
    expect(localizeEnterpriseSsoCheck(checks[0]!, 'fr')).toEqual({
      name: 'Document de découverte',
      detail:
        'Le document de découverte ne contient pas les champs requis suivants : authorization_endpoint, jwks_uri.',
    });
    expect(localizeEnterpriseSsoCheck(checks[1]!, 'fr').detail).toBe(
      'Le point de terminaison SSO a répondu (HTTP redirection).',
    );
  });

  it('drops unknown API copy instead of exposing it in French', () => {
    const rawName = 'Unreviewed upstream English check';
    const rawDetail = 'Leaked backend detail: tenant=secret';
    const [check] = normalizeEnterpriseSsoChecks([{ name: rawName, ok: false, detail: rawDetail }]);
    const localized = localizeEnterpriseSsoCheck(check!, 'fr');

    expect(JSON.stringify(check)).not.toContain(rawName);
    expect(JSON.stringify(check)).not.toContain(rawDetail);
    expect(localized).toEqual({
      name: 'Vérification du fournisseur',
      detail: 'Cette vérification du fournisseur a échoué.',
    });
  });

  it('maps API statuses to safe localized error codes', () => {
    expect(resolveEnterpriseSsoActionErrorCode(403, 'save')).toBe('requestRejected');
    expect(resolveEnterpriseSsoActionErrorCode(404, 'test')).toBe('providerNotConfigured');
    expect(resolveEnterpriseSsoActionErrorCode(400, 'save')).toBe('invalidConfiguration');
    expect(resolveEnterpriseSsoActionErrorCode(409, 'enforce')).toBe('conflict');
    expect(resolveEnterpriseSsoActionErrorCode(429, 'test')).toBe('rateLimited');
    expect(resolveEnterpriseSsoActionErrorCode(400, 'enforce')).toBe('enforcementFailed');
  });

  it('has zero hardcoded-copy scanner findings in the rendered route', async () => {
    const file = 'app/routes/enterprise-sso-settings.tsx';
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(readFileSync(file, 'utf8'), file);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
  });
});
