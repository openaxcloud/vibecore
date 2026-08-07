import { describe, expect, it } from 'vitest';
import {
  abuseWarningEmailContent,
  escapeEmailHtml,
  formatCurrencyMinor,
  formatTransactionalDate,
  invoiceEmailContent,
  invitationEmailContent,
  localeFromAcceptLanguage,
  localizedInactivityWarningEmailContent,
  localizedNotificationContent,
  localizedPublicErrorPayload,
  localizedSpendAlertEmailContent,
  passwordResetEmailContent,
  publicErrorMessage,
  resolveTransactionalLocale,
  TRANSACTIONAL_CATALOGUE,
  transactionalMessage,
  type TransactionalMessageKey,
  verificationEmailContent,
  welcomeEmailContent,
} from '../transactional-i18n.js';

const MESSAGE_PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

function placeholders(value: string): string[] {
  return [...value.matchAll(MESSAGE_PLACEHOLDER)].map((match) => match[1]).sort();
}

describe('transactional catalogue integrity', () => {
  it('keeps complete EN/FR key and interpolation-parameter parity', () => {
    const englishKeys = Object.keys(TRANSACTIONAL_CATALOGUE.en).sort();
    const frenchKeys = Object.keys(TRANSACTIONAL_CATALOGUE.fr).sort();

    expect(frenchKeys).toEqual(englishKeys);
    expect(englishKeys).toHaveLength(90);

    for (const key of englishKeys) {
      const messageKey = key as TransactionalMessageKey;

      expect(TRANSACTIONAL_CATALOGUE.en[messageKey].trim(), `${key} must have English copy`).not.toBe('');
      expect(TRANSACTIONAL_CATALOGUE.fr[messageKey].trim(), `${key} must have French copy`).not.toBe('');
      expect(placeholders(TRANSACTIONAL_CATALOGUE.fr[messageKey]), `${key} placeholder parity`).toEqual(
        placeholders(TRANSACTIONAL_CATALOGUE.en[messageKey]),
      );
    }
  });

  it('falls back safely without ever rendering a raw catalogue key', () => {
    expect(transactionalMessage({ locale: 'de-DE', key: 'welcome.subject' })).toBe('Welcome to E-Code');

    const unknownKey = 'missing.transactional.key' as TransactionalMessageKey;
    const french = transactionalMessage({ locale: 'fr', key: unknownKey });

    expect(french).toBe('La requête n’a pas pu aboutir. Veuillez réessayer.');
    expect(french).not.toContain(unknownKey);
  });

  it('interpolates every named value while preserving brands and recipient data', () => {
    expect(
      transactionalMessage({
        locale: 'fr',
        key: 'notification.connection.body.withAccount',
        values: { provider: 'GitHub', accountLabel: 'octocat' },
      }),
    ).toBe('Votre connexion GitHub (octocat) doit être reconnectée : son accès a été révoqué ou a expiré.');
  });
});

describe('transactional locale resolution', () => {
  it('prefers the persisted user language over request negotiation', () => {
    expect(resolveTransactionalLocale({ preferredLanguage: 'fr-FR', acceptLanguage: 'en-US' })).toBe('fr');
  });

  it('honours weighted supported Accept-Language values', () => {
    expect(localeFromAcceptLanguage('de-DE;q=1, fr-FR;q=0.8, en;q=0.5')).toBe('fr');
    expect(localeFromAcceptLanguage('fr;q=0, en;q=0.7')).toBe('en');
  });

  it('falls back to English for unsupported or malformed preferences', () => {
    expect(resolveTransactionalLocale({ preferredLanguage: 'es', acceptLanguage: 'de-DE' })).toBe('en');
  });
});

describe('backend public error catalogue', () => {
  it('localizes a stable code while preserving the code as a separate contract', () => {
    expect(
      publicErrorMessage({
        code: 'AUTH_INVALID_CREDENTIALS',
        locale: 'fr',
        englishFallback: 'Invalid credentials',
      }),
    ).toBe('Adresse e-mail ou mot de passe incorrect.');
  });

  it('keeps the exact English API fallback for compatible English clients', () => {
    expect(
      publicErrorMessage({
        code: 'RBAC_FORBIDDEN',
        locale: 'en',
        englishFallback: 'Missing permission: billing:read',
      }),
    ).toBe('Missing permission: billing:read');
  });

  it('never exposes an unknown catalogue key', () => {
    const message = publicErrorMessage({
      code: 'UNREGISTERED_INTERNAL_KEY',
      locale: 'fr',
      englishFallback: 'Internal English-only detail',
    });

    expect(message).toBe('La requête n’a pas pu aboutir. Veuillez réessayer.');
    expect(message).not.toContain('UNREGISTERED_INTERNAL_KEY');
    expect(message).not.toContain('English');
  });

  it('normalizes legacy error payloads without leaking English to French clients', () => {
    expect(localizedPublicErrorPayload({ error: 'Workspace agent is unavailable' }, 'fr')).toEqual({
      code: 'API_ERROR',
      error: 'La requête a échoué.',
    });
    expect(localizedPublicErrorPayload({ message: 'Legacy failure detail', requestId: 'req_1' }, 'fr')).toEqual({
      code: 'API_ERROR',
      message: 'La requête a échoué.',
      requestId: 'req_1',
    });
    expect(localizedPublicErrorPayload({ error: 'Exact legacy wording' }, 'en')).toEqual({
      code: 'API_ERROR',
      error: 'Exact legacy wording',
    });
  });
});

describe('transactional email templates', () => {
  it('renders French verification copy and HTML-escapes every interpolated token', () => {
    const maliciousToken = '"><script>alert(1)</script>';
    const content = verificationEmailContent({
      baseUrl: 'https://app.e-code.ai',
      token: maliciousToken,
      locale: 'fr',
    });

    expect(content.subject).toBe('Vérifiez votre adresse e-mail');
    expect(content.text).toContain('Ouvrez ce lien de vérification sécurisé');
    expect(content.html).toContain(escapeEmailHtml(maliciousToken));
    expect(content.html).not.toContain('<script>');
    expect(content.html).toContain('lang=fr');
  });

  it('keeps professional French reset and invitation variants', () => {
    const reset = passwordResetEmailContent({ baseUrl: 'https://app.e-code.ai', token: 'reset_123', locale: 'fr' });
    const invitation = invitationEmailContent({
      baseUrl: 'https://app.e-code.ai',
      token: 'invite_123',
      locale: 'fr',
      kind: 'resend',
    });

    expect(reset.subject).toBe('Réinitialisez votre mot de passe');
    expect(reset.text).toContain('Si vous n’êtes pas à l’origine');
    expect(invitation.subject).toBe('Votre lien d’invitation');
    expect(invitation.html).toContain('/invitations/accept');
  });

  it('renders the welcome email in French with an escaped name and localized dashboard link', () => {
    const content = welcomeEmailContent({
      baseUrl: 'https://app.e-code.ai',
      locale: 'fr',
      name: '<Avi>',
    });

    expect(content.subject).toBe('Bienvenue sur E-Code');
    expect(content.text).toContain('Bienvenue, <Avi>.');
    expect(content.html).toContain('Bienvenue, &lt;Avi&gt;.');
    expect(content.html).toContain('/dashboard?lang=fr');
    expect(content.html).not.toContain('<Avi>');
  });

  it('renders paid and failed invoice mail with the real currency and a trusted invoice URL', () => {
    const paid = invoiceEmailContent({
      event: 'paid',
      invoiceId: 'in_123',
      invoiceNumber: 'EC-2026-0042',
      amountMinor: 12345,
      currency: 'eur',
      createdAt: '2026-08-04T12:00:00.000Z',
      invoiceUrl: 'https://invoice.stripe.com/i/acct_123',
      locale: 'fr',
      timeZone: 'UTC',
    });
    const failed = invoiceEmailContent({
      event: 'payment_failed',
      invoiceId: 'in_124',
      amountMinor: 800,
      currency: 'usd',
      createdAt: '2026-08-04T12:00:00.000Z',
      invoiceUrl: 'javascript:alert(1)',
      locale: 'fr',
    });

    expect(paid.subject).toBe('Facture E-Code EC-2026-0042 payée');
    expect(paid.text).toContain('123,45');
    expect(paid.text).toContain('€');
    expect(paid.html).toContain('https://invoice.stripe.com/i/acct_123');
    expect(failed.subject).toContain('Échec du paiement');
    expect(failed.text).toMatch(/8,00\s|8,00 /);
    expect(failed.text).toMatch(/\$US|USD/);
    expect(failed.html).not.toContain('javascript:');
  });

  it('renders account-policy alerts in the persisted French locale', () => {
    const content = abuseWarningEmailContent({ eventType: 'terminal_abuse', locale: 'fr', name: '<Avi>' });

    expect(content.subject).toContain('activité récente');
    expect(content.text).toContain('Bonjour <Avi>');
    expect(content.text).toContain('politique d’utilisation acceptable');
    expect(content.html).toContain('Bonjour &lt;Avi&gt;');
    expect(content.html).not.toContain('<Avi>');
  });

  it('formats the real currency using French number rules without relabelling USD as EUR', () => {
    const usd = formatCurrencyMinor({ amountMinor: 800, currency: 'usd', locale: 'fr' });
    const eur = formatCurrencyMinor({ amountMinor: 800, currency: 'eur', locale: 'fr' });

    expect(usd).toContain('8,00');
    expect(usd).toMatch(/\$US|USD/);
    expect(usd).not.toContain('€');
    expect(eur).toContain('8,00');
    expect(eur).toContain('€');
    expect(eur).toMatch(/^8,00[\u00a0\u202f]€$/);
  });

  it('localizes technical formatting errors instead of exposing English detail in French', () => {
    expect(() => formatCurrencyMinor({ amountMinor: 100, currency: 'dollars', locale: 'fr' })).toThrow(
      'Devise ISO 4217 invalide : dollars',
    );
    expect(() => formatCurrencyMinor({ amountMinor: Number.NaN, currency: 'eur', locale: 'fr' })).toThrow(
      'Le montant doit être un nombre fini.',
    );
    expect(() => formatTransactionalDate({ value: 'not-a-date', locale: 'fr' })).toThrow('La date doit être valide.');
  });

  it('renders spend alerts in both languages with the requested currency', () => {
    const english = localizedSpendAlertEmailContent({
      pct: 80,
      paygSpentMinor: 800,
      budgetCapMinor: 1000,
      currency: 'usd',
      locale: 'en',
    });
    const french = localizedSpendAlertEmailContent({
      pct: 100,
      paygSpentMinor: 1000,
      budgetCapMinor: 1000,
      currency: 'eur',
      locale: 'fr',
    });

    expect(english.text).toContain('$8.00');
    expect(french.subject).toContain('10,00');
    expect(french.subject).toContain('€');
    expect(french.text).toContain('services facturés à l’usage sont suspendus');
  });

  it('uses French date formatting and singular/plural day forms', () => {
    const nowMs = Date.parse('2026-08-04T12:00:00.000Z');
    const singular = localizedInactivityWarningEmailContent({
      daysInactive: 364,
      deletionAfterDays: 365,
      nowMs,
      locale: 'fr',
      timeZone: 'UTC',
    });
    const plural = localizedInactivityWarningEmailContent({
      daysInactive: 360,
      deletionAfterDays: 365,
      nowMs,
      locale: 'fr',
      timeZone: 'UTC',
    });

    expect(singular.subject).toContain('1 jour');
    expect(plural.subject).toContain('5 jours');
    expect(plural.text).toContain('9 août 2026');
  });

  it('uses locale plural rules for zero and one day in both catalogues', () => {
    const nowMs = Date.parse('2026-08-04T12:00:00.000Z');
    const frenchZero = localizedInactivityWarningEmailContent({
      daysInactive: 365,
      deletionAfterDays: 365,
      nowMs,
      locale: 'fr',
      timeZone: 'UTC',
    });
    const englishOne = localizedInactivityWarningEmailContent({
      daysInactive: 364,
      deletionAfterDays: 365,
      nowMs,
      locale: 'en',
      timeZone: 'UTC',
    });

    expect(frenchZero.subject).toContain('0 jour');
    expect(englishOne.subject).toContain('1 day');
  });

  it('falls back to UTC when a stored timezone is invalid', () => {
    const value = '2026-08-04T23:00:00.000Z';

    expect(formatTransactionalDate({ value, locale: 'fr', timeZone: 'not/a-zone' })).toBe(
      formatTransactionalDate({ value, locale: 'fr', timeZone: 'UTC' }),
    );
  });
});

describe('notification descriptors', () => {
  it('renders a known descriptor in French while leaving provider data untouched', () => {
    expect(
      localizedNotificationContent({
        messageKey: 'notifications.connectionReconnectRequired',
        messageParams: { provider: 'GitHub', accountLabel: 'octocat' },
        fallbackTitle: 'Reconnect GitHub',
        fallbackBody: 'English fallback',
        locale: 'fr',
      }),
    ).toEqual({
      title: 'Reconnectez GitHub',
      body: 'Votre connexion GitHub (octocat) doit être reconnectée : son accès a été révoqué ou a expiré.',
    });
  });

  it('uses a localized provider fallback when descriptor parameters are incomplete', () => {
    expect(
      localizedNotificationContent({
        messageKey: 'notifications.connectionReconnectRequired',
        fallbackTitle: 'Reconnect provider',
        fallbackBody: 'English fallback',
        locale: 'fr',
      }),
    ).toEqual({
      title: 'Reconnectez le fournisseur',
      body: 'Cette connexion doit être reconnectée : son accès a été révoqué ou a expiré.',
    });
  });

  it('keeps legacy English copy but never leaks it through a French unknown descriptor', () => {
    expect(
      localizedNotificationContent({
        messageKey: 'notifications.unknown',
        fallbackTitle: 'Legacy title',
        fallbackBody: 'Legacy body',
        category: 'security',
        locale: 'fr',
      }),
    ).toEqual({
      title: 'Alerte de sécurité',
      body: 'Consultez l’activité de sécurité associée pour plus de détails.',
    });
    expect(
      localizedNotificationContent({
        fallbackTitle: 'Legacy title',
        fallbackBody: 'Legacy body',
        category: 'security',
        locale: 'en',
      }),
    ).toEqual({ title: 'Legacy title', body: 'Legacy body' });
  });
});
