import { describe, expect, it } from 'vitest';

import { connectorProxyEn, connectorProxyFr, resolveConnectorProxyLanguage } from './public-i18n.js';

describe('connector proxy public i18n', () => {
  it('keeps exact English and French error-code parity', () => {
    expect(Object.keys(connectorProxyFr).sort()).toEqual(Object.keys(connectorProxyEn).sort());
    expect(connectorProxyFr.CONNECTOR_TOKEN_MISSING).toContain('jeton d’accès');
    expect(Object.values(connectorProxyFr).join(' ')).not.toMatch(/\btoken\b/iu);
  });

  it('honors manual then automatic cookies before weighted Accept-Language', () => {
    expect(
      resolveConnectorProxyLanguage({
        cookie: 'vibecore-auto-lang=fr; vibecore-lang=en',
        'accept-language': 'fr-FR',
      }),
    ).toBe('en');
    expect(resolveConnectorProxyLanguage({ cookie: 'vibecore-auto-lang=fr', 'accept-language': 'en-US' })).toBe('fr');
    expect(resolveConnectorProxyLanguage({ 'accept-language': 'en;q=0.2, fr-FR;q=0.9' })).toBe('fr');
    expect(resolveConnectorProxyLanguage({ 'accept-language': 'de-DE' })).toBe('en');
  });
});
