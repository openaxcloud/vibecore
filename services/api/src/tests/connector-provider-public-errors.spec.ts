import { describe, expect, it } from 'vitest';
import { localizeAppPublicMessage } from '../app-public-copy.js';
import {
  connectorPublicErrorCodes,
  connectorPublicErrorMessage,
  type ConnectorPublicErrorCode,
} from '../integrations/providers/public-error-copy.js';

describe('connector provider public error copy', () => {
  it('has EN/FR copy for every stable public provider code', () => {
    const expectedCodes: ConnectorPublicErrorCode[] = [
      'API_KEY_EXPIRED',
      'API_KEY_INSUFFICIENT_SCOPE',
      'API_KEY_INVALID',
      'PROVIDER_RESPONSE_MALFORMED',
      'PROVIDER_TOKEN_EXCHANGE_FAILED',
      'PROVIDER_UNREACHABLE',
      'PROVIDER_UNSUPPORTED_OPERATION',
      'PROVIDER_USER_INFO_FAILED',
    ];

    expect([...connectorPublicErrorCodes()].sort()).toEqual(expectedCodes.sort());

    for (const code of expectedCodes) {
      const english = connectorPublicErrorMessage({ code, locale: 'en' });
      const french = connectorPublicErrorMessage({ code, locale: 'fr' });

      expect(english).not.toBe(french);
      expect(english).not.toContain('{provider}');
      expect(french).not.toContain('{provider}');
      expect(localizeAppPublicMessage(english, 'fr')).toEqual({ matched: true, value: french });
      expect(localizeAppPublicMessage(french, 'fr')).toEqual({ matched: true, value: french });
    }
  });

  it('returns professional French copy without exposing a catalogue key', () => {
    expect(connectorPublicErrorMessage({ code: 'PROVIDER_USER_INFO_FAILED', locale: 'fr' })).toBe(
      'Impossible de récupérer les informations du compte connecté. Veuillez réessayer.',
    );
  });
});
