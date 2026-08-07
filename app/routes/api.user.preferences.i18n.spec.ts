import { describe, expect, it } from 'vitest';

import { action } from './api.user.preferences';

type ActionResult = {
  data: { ok: false; code: string; error: string };
  init?: ResponseInit;
};

async function rejectedPreferenceRequest(acceptLanguage: string): Promise<ActionResult> {
  return action({
    request: new Request('https://app.e-code.ai/api/user/preferences', {
      method: 'POST',
      headers: { 'accept-language': acceptLanguage },
    }),
    params: {},
    context: {},
  } as never) as Promise<ActionResult>;
}

describe('/api/user/preferences locale-safe errors', () => {
  it('returns a stable code and French copy for an unsupported method', async () => {
    const result = await rejectedPreferenceRequest('fr-FR, en;q=0.8');

    expect(result.init?.status).toBe(405);
    expect(result.data).toEqual({
      ok: false,
      code: 'METHOD_NOT_ALLOWED',
      error: 'Méthode non autorisée',
    });
  });

  it('keeps English as the fallback', async () => {
    const result = await rejectedPreferenceRequest('de-DE');

    expect(result.data.error).toBe('Method not allowed');
  });
});
