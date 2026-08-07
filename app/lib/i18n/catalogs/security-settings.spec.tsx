import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { getSecuritySettingsCopy, securitySettingsEn, securitySettingsFr } from './security-settings';

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

describe('security settings EN/FR catalog', () => {
  it('keeps strict flat key, non-empty value and interpolation parity', () => {
    expect(Object.keys(securitySettingsFr).sort()).toEqual(Object.keys(securitySettingsEn).sort());

    for (const key of Object.keys(securitySettingsEn) as Array<keyof typeof securitySettingsEn>) {
      expect(typeof securitySettingsEn[key], key).toBe('string');
      expect(securitySettingsEn[key].trim().length, key).toBeGreaterThan(0);
      expect(securitySettingsFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(securitySettingsFr[key]), key).toEqual(interpolationTokens(securitySettingsEn[key]));
    }
  });

  it('uses reviewed French security terminology and English fallback', () => {
    const french = getSecuritySettingsCopy('fr-FR');

    expect(french['securitySettings.page.title']).toBe('Paramètres de sécurité');
    expect(french['securitySettings.item.passkeys.title']).toBe('Clés d’accès (passkeys) et clés de sécurité');
    expect(french['securitySettings.item.sessions.title']).toBe('Sessions actives');
    expect(french['securitySettings.item.recovery.title']).toBe('Codes de récupération');
    expect(getSecuritySettingsCopy('de-DE')['securitySettings.page.title']).toBe('Security settings');
  });

  it('preserves security standards and product terminology that must not be translated', () => {
    const french = getSecuritySettingsCopy('fr');

    expect(french['securitySettings.enterprise.description']).toContain('SSO (SAML/OIDC)');
    expect(french['securitySettings.enterprise.description']).toContain('SCIM');
    expect(french['securitySettings.enterprise.description']).toContain('SIEM');
    expect(french['securitySettings.meta.description']).toContain('E-Code');
  });

  it('has zero hardcoded-copy scanner findings in the rendered route', async () => {
    const file = 'app/routes/security-settings.tsx';
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(readFileSync(file, 'utf8'), file);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
  });
});
