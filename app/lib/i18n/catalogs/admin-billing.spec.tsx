import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  adminBillingEn,
  adminBillingFr,
  formatAdminBillingCurrency,
  formatAdminBillingDate,
  formatAdminBillingError,
  formatAdminBillingMonthlyPrice,
  formatAdminBillingPlanCount,
  formatAdminBillingStatus,
  formatAdminBillingSubscriptionCount,
  getAdminBillingCopy,
  getAdminBillingSubscriptionStatus,
  resolveAdminBillingErrorCode,
} from './admin-billing';

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

function apiError(status: number, error: string, code?: string): Response {
  return new Response(JSON.stringify({ error, code }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('admin billing EN/FR catalog', () => {
  it('keeps strict flat key, non-empty value and interpolation parity', () => {
    expect(Object.keys(adminBillingFr).sort()).toEqual(Object.keys(adminBillingEn).sort());

    for (const key of Object.keys(adminBillingEn) as Array<keyof typeof adminBillingEn>) {
      expect(typeof adminBillingEn[key], key).toBe('string');
      expect(adminBillingEn[key].trim().length, key).toBeGreaterThan(0);
      expect(adminBillingFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(adminBillingFr[key]), key).toEqual(interpolationTokens(adminBillingEn[key]));
    }
  });

  it('uses reviewed French administration terminology and English fallback', () => {
    const french = getAdminBillingCopy('fr-FR');

    expect(french['adminBilling.page.title']).toBe('Administration de la facturation');
    expect(french['adminBilling.quota.title']).toBe('Créer une dérogation de quota');
    expect(french['adminBilling.planOverride.title']).toBe('Appliquer une dérogation d’offre');
    expect(getAdminBillingCopy('de-DE')['adminBilling.page.title']).toBe('Billing administration');
  });

  it('formats EUR amounts, dates, numbers and plurals through Intl', () => {
    expect(formatAdminBillingCurrency(123450, 'EUR', 'fr')).toMatch(/^1 234,50\s€$/u);
    expect(formatAdminBillingMonthlyPrice(2500, 'fr')).toMatch(/^25,00\s€ par mois$/u);
    expect(formatAdminBillingDate('2026-06-01T12:30:00.000Z', 'fr')).toMatch(/^01.*juin.*2026$/u);
    expect(formatAdminBillingDate('not-a-date', 'fr')).toBe('Date indisponible');
    expect(formatAdminBillingPlanCount(1, 'fr')).toBe('1 offre configurée');
    expect(formatAdminBillingPlanCount(1234, 'fr')).toBe('1 234 offres configurées');
    expect(formatAdminBillingSubscriptionCount(1, 'fr')).toBe('1 abonnement récent');
    expect(formatAdminBillingSubscriptionCount(2, 'fr')).toBe('2 abonnements récents');
  });

  it('localizes every closed subscription status and masks unknown backend prose', () => {
    expect(getAdminBillingSubscriptionStatus('TRIALING', 'fr')).toBe('Période d’essai');
    expect(getAdminBillingSubscriptionStatus('ACTIVE', 'fr')).toBe('Actif');
    expect(getAdminBillingSubscriptionStatus('PAST_DUE', 'fr')).toBe('Paiement en retard');
    expect(getAdminBillingSubscriptionStatus('CANCELED', 'fr')).toBe('Résilié');
    expect(getAdminBillingSubscriptionStatus('UNPAID', 'fr')).toBe('Impayé');
    expect(getAdminBillingSubscriptionStatus('Raw English upstream status', 'fr')).toBe('Statut inconnu');
  });

  it('formats structured action feedback without exposing raw values', () => {
    expect(formatAdminBillingStatus({ statusCode: 'quotaCreated' }, 'fr')).toBe('Dérogation de quota créée.');
    expect(formatAdminBillingStatus({ statusCode: 'planCreated' }, 'fr')).toBe('Dérogation d’offre appliquée.');
    expect(formatAdminBillingError({ errorCode: 'invalidLimit' }, 'fr')).toBe(
      'Saisissez une limite de quota entière, positive ou nulle.',
    );
  });

  it('maps API failures to safe codes without returning raw prose', async () => {
    const rawMessage = 'Database tenant secret and Stripe customer leaked here';

    await expect(resolveAdminBillingErrorCode(apiError(400, rawMessage), 'quota')).resolves.toBe('invalidChange');
    await expect(
      resolveAdminBillingErrorCode(apiError(403, rawMessage, 'ADMIN_REAUTH_REQUIRED'), 'plan'),
    ).resolves.toBe('reauthExpired');
    await expect(
      resolveAdminBillingErrorCode(apiError(403, rawMessage, 'PLATFORM_ADMIN_REQUIRED'), 'quota'),
    ).resolves.toBe('platformAdminRequired');
    await expect(resolveAdminBillingErrorCode(apiError(401, rawMessage), 'reauth')).resolves.toBe('incorrectPassword');
    await expect(resolveAdminBillingErrorCode(apiError(404, rawMessage), 'plan')).resolves.toBe('resourceNotFound');
    await expect(resolveAdminBillingErrorCode(apiError(429, rawMessage), 'quota')).resolves.toBe('rateLimited');
    await expect(resolveAdminBillingErrorCode(new Error(rawMessage), 'plan')).resolves.toBe('serviceUnavailable');
  });

  it('has zero hardcoded-copy scanner findings in the rendered route', async () => {
    const file = 'app/routes/admin.billing.tsx';
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(readFileSync(file, 'utf8'), file);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
  });
});
