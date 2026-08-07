import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  adminStripeEn,
  adminStripeFr,
  formatAdminStripeAttemptCount,
  formatAdminStripeCurrency,
  formatAdminStripeDateTime,
  formatAdminStripeError,
  formatAdminStripeStatus,
  formatAdminStripeWebhookCount,
  getAdminStripeCopy,
  resolveAdminStripeErrorCode,
} from './admin-stripe';

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

function apiError(status: number, error: string, code?: string): Response {
  return new Response(JSON.stringify({ error, code }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('admin Stripe EN/FR catalog', () => {
  it('keeps strict flat key, non-empty value and interpolation parity', () => {
    expect(Object.keys(adminStripeFr).sort()).toEqual(Object.keys(adminStripeEn).sort());

    for (const key of Object.keys(adminStripeEn) as Array<keyof typeof adminStripeEn>) {
      expect(typeof adminStripeEn[key], key).toBe('string');
      expect(adminStripeEn[key].trim().length, key).toBeGreaterThan(0);
      expect(adminStripeFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(adminStripeFr[key]), key).toEqual(interpolationTokens(adminStripeEn[key]));
    }
  });

  it('uses reviewed French billing terminology and English fallback', () => {
    const french = getAdminStripeCopy('fr-FR');

    expect(french['adminStripe.page.title']).toBe('Configuration Stripe');
    expect(french['adminStripe.section.prices.title']).toBe('IDs de prix des offres');
    expect(french['adminStripe.section.webhooks.title']).toBe('Webhooks en échec');
    expect(french['adminStripe.action.save']).toBe('Enregistrer la configuration Stripe');
    expect(getAdminStripeCopy('de-DE')['adminStripe.page.title']).toBe('Stripe configuration');
  });

  it('formats French numbers, plurals, dates and currencies through Intl', () => {
    expect(formatAdminStripeWebhookCount(1, 'fr')).toBe('1 livraison non résolue');
    expect(formatAdminStripeWebhookCount(1234, 'fr')).toBe('1 234 livraisons non résolues');
    expect(formatAdminStripeAttemptCount(1, 'fr')).toBe('1 tentative');
    expect(formatAdminStripeAttemptCount(2, 'fr')).toBe('2 tentatives');
    expect(formatAdminStripeDateTime('2026-06-01T12:30:00.000Z', 'fr')).toMatch(/1.*juin.*2026.*12:30/u);
    expect(formatAdminStripeDateTime('not-a-date', 'fr')).toBe('Date indisponible');
    expect(formatAdminStripeCurrency(1234.5, 'EUR', 'fr')).toMatch(/^1 234,50\s€$/u);
    expect(formatAdminStripeCurrency(25, 'x-custom', 'fr')).toBe('25 x-custom');
  });

  it('formats replay successes and plural-aware partial failures', () => {
    expect(formatAdminStripeStatus({ statusCode: 'webhookReplayed', eventId: 'evt_123' }, 'fr')).toBe(
      'Webhook evt_123 relancé avec succès.',
    );
    expect(formatAdminStripeStatus({ statusCode: 'webhooksReplayed', replayed: 2 }, 'fr')).toBe(
      '2 webhooks relancés avec succès.',
    );
    expect(formatAdminStripeError({ errorCode: 'partialReplay', replayed: 1, failed: 2 }, 'fr')).toBe(
      '1 webhook relancé avec succès ; 2 ont de nouveau échoué. Consultez les journaux serveur avant de réessayer.',
    );
  });

  it('maps API failures to safe codes without returning raw prose', async () => {
    const rawMessage = 'Database tenant stripe secret sk_live_leak was rejected';

    await expect(resolveAdminStripeErrorCode(apiError(400, rawMessage), 'save')).resolves.toBe('invalidConfiguration');
    await expect(resolveAdminStripeErrorCode(apiError(403, rawMessage, 'ADMIN_REAUTH_REQUIRED'), 'save')).resolves.toBe(
      'reauthExpired',
    );
    await expect(
      resolveAdminStripeErrorCode(apiError(404, rawMessage, 'STRIPE_WEBHOOK_FAILURE_NOT_FOUND'), 'replay'),
    ).resolves.toBe('webhookFailureNotFound');
    await expect(resolveAdminStripeErrorCode(apiError(401, rawMessage), 'reauth')).resolves.toBe('incorrectPassword');
    await expect(resolveAdminStripeErrorCode(apiError(429, rawMessage), 'replay')).resolves.toBe('rateLimited');
    await expect(resolveAdminStripeErrorCode(new Error(rawMessage), 'save')).resolves.toBe('serviceUnavailable');
  });

  it('has zero hardcoded-copy scanner findings in the rendered route', async () => {
    const file = 'app/routes/admin.stripe.tsx';
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(readFileSync(file, 'utf8'), file);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
  });
});
