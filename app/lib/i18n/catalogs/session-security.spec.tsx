import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  describeSessionSecurityDevice,
  formatSessionSecurityCopy,
  formatSessionSecurityDateTime,
  getSessionSecurityCopy,
  sessionSecurityEn,
  sessionSecurityErrorCodeForStatus,
  sessionSecurityErrorMessage,
  sessionSecurityFr,
  sessionSecurityStatusMessage,
} from './session-security';

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

describe('session security EN/FR catalog', () => {
  it('keeps strict flat key, non-empty value and interpolation parity', () => {
    expect(Object.keys(sessionSecurityFr).sort()).toEqual(Object.keys(sessionSecurityEn).sort());

    for (const key of Object.keys(sessionSecurityEn) as Array<keyof typeof sessionSecurityEn>) {
      expect(typeof sessionSecurityEn[key], key).toBe('string');
      expect(sessionSecurityEn[key].trim().length, key).toBeGreaterThan(0);
      expect(sessionSecurityFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(sessionSecurityFr[key]), key).toEqual(interpolationTokens(sessionSecurityEn[key]));
    }
  });

  it('uses reviewed French session terminology and English fallback', () => {
    const french = getSessionSecurityCopy('fr-FR');

    expect(french['sessionSecurity.page.title']).toBe('Sécurité des sessions');
    expect(french['sessionSecurity.sessions.title']).toBe('Sessions actives');
    expect(french['sessionSecurity.sessions.thisDevice']).toBe('Cet appareil');
    expect(french['sessionSecurity.sessions.revoke']).toBe('Révoquer');
    expect(french['sessionSecurity.policy.title']).toBe('Politique de session de l’organisation');
    expect(getSessionSecurityCopy('de-DE')['sessionSecurity.page.title']).toBe('Session security');
  });

  it('interpolates devices and preserves technical browser, OS and IP terminology', () => {
    const french = getSessionSecurityCopy('fr');

    expect(describeSessionSecurityDevice('Mozilla/5.0 (Macintosh) AppleWebKit Chrome/126.0', 'fr')).toBe(
      'Chrome sur macOS',
    );
    expect(describeSessionSecurityDevice('Mozilla/5.0 (iPhone) AppleWebKit Safari/605.1', 'fr')).toBe('Safari sur iOS');
    expect(describeSessionSecurityDevice(undefined, 'fr')).toBe('Appareil inconnu');
    expect(formatSessionSecurityCopy(french['sessionSecurity.sessions.ipAddress'], { address: '203.0.113.10' })).toBe(
      'IP : 203.0.113.10',
    );
    expect(french['sessionSecurity.meta.description']).toContain('E-Code');
  });

  it('formats dates in the active locale and masks invalid dates with localized copy', () => {
    const value = '2026-06-02T14:05:00.000Z';
    const french = formatSessionSecurityDateTime(value, 'fr');
    const english = formatSessionSecurityDateTime(value, 'en');

    expect(french).toMatch(/2 juin 2026/u);
    expect(english).toMatch(/2 Jun 2026/u);
    expect(french).not.toBe(english);
    expect(formatSessionSecurityDateTime('not-a-date', 'fr')).toBe('date indisponible');
  });

  it('maps action results and HTTP failures to localized, non-raw messages', () => {
    expect(sessionSecurityStatusMessage('policySaved', 'fr')).toBe('Politique de sécurité des sessions enregistrée.');
    expect(sessionSecurityErrorCodeForStatus(403)).toBe('forbidden');
    expect(sessionSecurityErrorCodeForStatus(404)).toBe('notFound');
    expect(sessionSecurityErrorCodeForStatus(409)).toBe('conflict');
    expect(sessionSecurityErrorCodeForStatus(429)).toBe('rateLimited');
    expect(sessionSecurityErrorCodeForStatus(422)).toBe('rejected');
    expect(sessionSecurityErrorMessage('forbidden', 'fr')).toBe(
      'Vous n’êtes pas autorisé à effectuer cette action de sécurité.',
    );
  });

  it('has zero hardcoded-copy scanner findings in the rendered route', async () => {
    const file = 'app/routes/session-security.tsx';
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(readFileSync(file, 'utf8'), file);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
  });
});
