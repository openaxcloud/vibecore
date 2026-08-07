import { describe, expect, it } from 'vitest';

import { aiGatewayError, aiGatewayLocaleFromHeader, aiGatewayMessage, localizedAiGatewayError } from './public-i18n.js';

describe('AI gateway public i18n', () => {
  it('negotiates weighted French and falls back to English', () => {
    expect(aiGatewayLocaleFromHeader('en;q=0.4, fr-FR;q=0.9')).toBe('fr');
    expect(aiGatewayLocaleFromHeader('de-DE')).toBe('en');
  });

  it('localizes typed plan and validation failures without exposing message keys', () => {
    const error = aiGatewayError('rolesMaximum', {
      statusCode: 400,
      code: 'AGENT_RUN_BAD_REQUEST',
      values: { maximum: 5 },
    });

    expect(localizedAiGatewayError(error, 'fr', 'agentRunFailed')).toBe(
      'Le champ roles ne peut pas contenir plus de 5 entrées.',
    );
    expect(aiGatewayMessage('modelPlanBlocked', 'fr')).toBe('Ce modèle n’est pas disponible avec votre offre.');
  });
});
