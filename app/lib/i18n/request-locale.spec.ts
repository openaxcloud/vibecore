import { describe, expect, it } from 'vitest';

import { AUTO_LANGUAGE_COOKIE, USER_LANGUAGE_COOKIE } from './language';
import { languageFromAcceptHeader, localeResponseHeaders, resolveRequestLocale } from './request-locale';

describe('request locale resolution', () => {
  it('honours weighted Accept-Language preferences on the first request', () => {
    expect(languageFromAcceptHeader('de-DE;q=0.9, fr-FR;q=0.8, en;q=0.6')).toBe('fr');
    expect(languageFromAcceptHeader('fr-CA, en;q=0.7')).toBe('fr');
    expect(languageFromAcceptHeader('es-ES, fr-FR;q=0.8')).toBe('fr');
  });

  it('ignores invalid quality weights instead of letting them override a valid preference', () => {
    expect(languageFromAcceptHeader('fr-FR;q=1.5, en-US;q=0.8')).toBe('en');
    expect(languageFromAcceptHeader('fr-FR;q=bogus, en-US;q=0.8')).toBe('en');
    expect(languageFromAcceptHeader('fr-FR; Q = 0.9, en-US;q=0.8')).toBe('fr');
  });

  it('uses the manual cookie before the automatic first-visit cookie and browser header', () => {
    const request = new Request('https://e-code.ai/pricing', {
      headers: {
        Cookie: `${AUTO_LANGUAGE_COOKIE}=fr; ${USER_LANGUAGE_COOKIE}=en`,
        'Accept-Language': 'fr-FR',
      },
    });

    expect(resolveRequestLocale(request)).toEqual({
      language: 'en',
      source: 'manual-cookie',
      persistAutomaticChoice: false,
      persistManualChoice: false,
    });
  });

  it('persists browser detection once so it is not rerun on later visits', () => {
    const request = new Request('https://e-code.ai/', { headers: { 'Accept-Language': 'fr-FR, en;q=0.8' } });
    const resolution = resolveRequestLocale(request);
    const headers = localeResponseHeaders(request, resolution);

    expect(resolution.language).toBe('fr');
    expect(resolution.source).toBe('accept-language');
    expect(headers.get('Set-Cookie')).toContain(`${AUTO_LANGUAGE_COOKIE}=fr`);
    expect(headers.get('Set-Cookie')).toContain('Domain=.e-code.ai');
    expect(headers.get('Set-Cookie')).toContain('Secure');
    expect(headers.get('Content-Language')).toBe('fr');
    expect(headers.get('Vary')).toContain('Accept-Language');
  });

  it('reuses the first-visit cookie without detecting or persisting again', () => {
    const request = new Request('https://e-code.ai/', {
      headers: {
        Cookie: `${AUTO_LANGUAGE_COOKIE}=fr`,
        'Accept-Language': 'en-US',
      },
    });

    const resolution = resolveRequestLocale(request);

    expect(resolution).toEqual({
      language: 'fr',
      source: 'automatic-cookie',
      persistAutomaticChoice: false,
      persistManualChoice: false,
    });
    expect(localeResponseHeaders(request, resolution).get('Set-Cookie')).toBeNull();
  });

  it('normalizes legacy non-French automatic cookies to the English default', () => {
    expect(
      resolveRequestLocale(
        new Request('https://e-code.ai/', {
          headers: { Cookie: `${AUTO_LANGUAGE_COOKIE}=es`, 'Accept-Language': 'fr-FR' },
        }),
      ),
    ).toMatchObject({ language: 'en', source: 'automatic-cookie' });
  });

  it('treats an explicit query locale as a manual choice', () => {
    const request = new Request('https://e-code.ai/dashboard?lang=fr', {
      headers: { Cookie: `${USER_LANGUAGE_COOKIE}=en` },
    });

    const resolution = resolveRequestLocale(request);

    const headers = localeResponseHeaders(request, resolution);

    expect(resolution).toMatchObject({ language: 'fr', source: 'query', persistManualChoice: true });
    expect(headers.get('Set-Cookie')).toContain(`${USER_LANGUAGE_COOKIE}=fr`);
  });

  it('falls back to English for unsupported or absent preferences', () => {
    for (const request of [
      new Request('https://e-code.ai/'),
      new Request('https://e-code.ai/', { headers: { 'Accept-Language': 'de-DE' } }),
      new Request('https://e-code.ai/', { headers: { 'Accept-Language': 'es-ES' } }),
    ]) {
      const resolution = resolveRequestLocale(request);

      expect(resolution).toMatchObject({
        language: 'en',
        source: 'default',
        persistAutomaticChoice: false,
      });
      expect(localeResponseHeaders(request, resolution).get('Set-Cookie')).toBeNull();
    }
  });
});
