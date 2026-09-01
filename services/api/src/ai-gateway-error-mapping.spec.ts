/*
 * BUG-AI-002 — un test par mécanisme.
 */
import { describe, expect, it } from 'vitest';

import { estActionnableParUtilisateur, mapperErreurPasserelle } from './ai-gateway-error-mapping.js';

const PAR_DEFAUT = 'Internal server error';

describe('traduction des erreurs de la passerelle IA', () => {
  it('1. répercute un 403 « plan » avec son code ET son message', () => {
    const r = mapperErreurPasserelle(
      403,
      { error: 'No model from this provider is available on your plan.', code: 'AI_MODEL_PLAN_BLOCKED' },
      PAR_DEFAUT,
    );

    expect(r.statusCode).toBe(403);
    expect(r.code).toBe('AI_MODEL_PLAN_BLOCKED');
    expect(r.message).toBe('No model from this provider is available on your plan.');
  });

  it('2. répercute aussi 429 et 400 — le motif n’est pas propre au 403', () => {
    expect(mapperErreurPasserelle(429, { code: 'AI_RATE_LIMITED' }, PAR_DEFAUT).statusCode).toBe(429);
    expect(mapperErreurPasserelle(400, { code: 'AI_MESSAGES_REQUIRED' }, PAR_DEFAUT).code).toBe('AI_MESSAGES_REQUIRED');
  });

  it('3. garde 502 sur une panne AMONT — l’utilisateur n’y peut rien', () => {
    /*
     * Renvoyer le 500 de l'amont laisserait croire que l'entrée est en cause.
     * Et surtout : le message interne de l'amont ne doit pas fuir tel quel.
     */
    const r = mapperErreurPasserelle(500, { error: 'The completion failed.', code: 'AI_COMPLETION_FAILED' }, PAR_DEFAUT);

    expect(r.statusCode).toBe(502);
    expect(r.code).toBe('AI_GATEWAY_REQUEST_FAILED');
    expect(r.message).toBe(PAR_DEFAUT);
  });

  it('4. reste sûre quand l’amont ne dit rien d’exploitable', () => {
    expect(mapperErreurPasserelle(403, undefined, PAR_DEFAUT)).toEqual({
      statusCode: 403,
      code: 'AI_GATEWAY_REQUEST_FAILED',
      message: PAR_DEFAUT,
    });
    expect(mapperErreurPasserelle(403, { error: '   ', code: '' }, PAR_DEFAUT).message).toBe(PAR_DEFAUT);
  });

  it('5. la frontière « actionnable » est bien 4xx', () => {
    expect(estActionnableParUtilisateur(399)).toBe(false);
    expect(estActionnableParUtilisateur(400)).toBe(true);
    expect(estActionnableParUtilisateur(499)).toBe(true);
    expect(estActionnableParUtilisateur(500)).toBe(false);
  });
});
