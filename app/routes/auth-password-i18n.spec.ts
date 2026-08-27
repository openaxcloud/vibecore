/**
 * @vitest-environment node
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
  };
});

import { action as forgotAction, meta as forgotMeta } from './forgot-password';
import { action as resetAction, meta as resetMeta } from './reset-password';
import { meta as verifyMeta } from './verify-email';
import { toResponse } from '~/lib/test/rr7-data';

function buildActionArgs(path: string, fields: Record<string, string>) {
  return {
    request: new Request(`http://app.e-code.ai/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields),
    }),
    params: {},
    context: {},
  } as never;
}

afterEach(() => {
  apiRequest.mockReset();
});

describe('localized password actions', () => {
  it('returns a non-enumerating stable code after a reset request', async () => {
    apiRequest.mockResolvedValueOnce({});

    const response = toResponse(await forgotAction(buildActionArgs('forgot-password', { email: 'ada@example.com' })));

    expect(await response.json()).toEqual({ statusCode: 'AUTH_RESET_REQUESTED' });
  });

  it('never forwards raw password-reset API prose to the UI', async () => {
    apiRequest.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'INTERNAL RESET DATABASE DETAIL' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = toResponse(await forgotAction(buildActionArgs('forgot-password', { email: 'ada@example.com' })));

    expect(await response.json()).toEqual({ errorCode: 'AUTH_RESET_REQUEST_FAILED' });
  });

  it('returns interpolation data instead of English for local validation', async () => {
    const response = toResponse(
      await resetAction(
        buildActionArgs('reset-password', {
          token: 'reset_abc1234567890123',
          password: 'short',
          confirmPassword: 'short',
        }),
      ),
    );

    expect(await response.json()).toEqual({
      errorCode: 'AUTH_PASSWORD_TOO_SHORT',
      errorParams: { count: 8 },
    });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('preserves a specific invalid-token code without exposing API prose', async () => {
    apiRequest.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'Token expired at internal timestamp', code: 'AUTH_INVALID_RESET_TOKEN' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = toResponse(
      await resetAction(
        buildActionArgs('reset-password', {
          token: 'reset_abc1234567890123',
          password: 'correcthorse',
          confirmPassword: 'correcthorse',
        }),
      ),
    );

    expect(await response.json()).toEqual({ errorCode: 'AUTH_INVALID_RESET_TOKEN' });
  });
});

describe('localized auth metadata', () => {
  it.each([
    [forgotMeta, 'Mot de passe oublié - E-Code'],
    [resetMeta, 'Réinitialiser le mot de passe - E-Code'],
    [verifyMeta, 'Vérifier l’adresse e-mail - E-Code'],
  ])('uses the French catalog for the active request locale', (meta, title) => {
    const metadata = meta({ data: { language: 'fr' } } as never);

    expect(metadata).toContainEqual({ title });
  });
});
