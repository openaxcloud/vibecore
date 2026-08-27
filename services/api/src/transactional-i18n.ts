import rawTransactionalCatalogue from './transactional-i18n.json' with { type: 'json' };

/**
 * Locale-safe copy for backend-owned, user-visible communication.
 *
 * Keep this module IO-free: callers resolve the recipient/request locale and
 * pass only trusted application data. English is always the final fallback so
 * a missing translation can never expose an internal catalogue key.
 */

export const TRANSACTIONAL_LOCALES = ['en', 'fr'] as const;

export type TransactionalLocale = (typeof TRANSACTIONAL_LOCALES)[number];

export type TransactionalEmailContent = Readonly<{
  subject: string;
  text: string;
  html: string;
}>;

type LocaleCatalogue<T> = Readonly<Record<TransactionalLocale, T>>;

const DEFAULT_LOCALE: TransactionalLocale = 'en';
const INTL_LOCALE: LocaleCatalogue<string> = {
  en: 'en-US',
  fr: 'fr-FR',
};

/**
 * Static backend copy lives outside executable source so the source scanner can
 * distinguish catalogue data from hard-coded UI strings. Clone and freeze both
 * locales to prevent one request or test from mutating process-wide copy.
 */
export const TRANSACTIONAL_CATALOGUE = Object.freeze({
  en: Object.freeze({ ...rawTransactionalCatalogue.en }),
  fr: Object.freeze({ ...rawTransactionalCatalogue.fr }),
});

export type TransactionalMessageKey = keyof typeof TRANSACTIONAL_CATALOGUE.en;

type TransactionalMessageValues = Readonly<Record<string, unknown>>;

const GENERIC_MESSAGE_KEY: TransactionalMessageKey = 'errors.GENERIC';
const MESSAGE_PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

/**
 * Resolve and interpolate one backend message. A missing locale entry falls
 * back to English; an unknown runtime key falls back to a generic sentence, so
 * catalogue identifiers are never rendered to recipients.
 */
export function transactionalMessage(input: {
  locale?: string | null;
  key: TransactionalMessageKey;
  values?: TransactionalMessageValues;
}): string {
  const locale = normalizeTransactionalLocale(input.locale) ?? DEFAULT_LOCALE;
  const catalogues = TRANSACTIONAL_CATALOGUE as Readonly<
    Record<string, Readonly<Partial<Record<TransactionalMessageKey, string>>>>
  >;
  const english = TRANSACTIONAL_CATALOGUE.en as Readonly<Partial<Record<TransactionalMessageKey, string>>>;
  const localized = catalogues[locale];
  const template =
    localized?.[input.key] ??
    english[input.key] ??
    localized?.[GENERIC_MESSAGE_KEY] ??
    english[GENERIC_MESSAGE_KEY] ??
    '';

  return template.replace(MESSAGE_PLACEHOLDER, (_match, placeholder: string) => {
    if (!input.values || !Object.prototype.hasOwnProperty.call(input.values, placeholder)) {
      return '';
    }

    const value = input.values[placeholder];

    return value === null || value === undefined ? '' : String(value);
  });
}

export function normalizeTransactionalLocale(value: unknown): TransactionalLocale | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const primary = value.trim().toLowerCase().split(/[-_]/)[0];

  return primary === 'en' || primary === 'fr' ? primary : undefined;
}

/** Resolve the best supported language from a weighted Accept-Language value. */
export function localeFromAcceptLanguage(
  value: string | readonly string[] | null | undefined,
): TransactionalLocale | undefined {
  const header = typeof value === 'string' ? value : value ? [...value].join(',') : undefined;

  if (!header) {
    return undefined;
  }

  return header
    .split(',')
    .map((entry, index) => {
      const [tag, ...parameters] = entry.trim().split(';');
      const qualityParameter = parameters.find((parameter) => parameter.trim().toLowerCase().startsWith('q='));
      const parsedQuality = qualityParameter ? Number.parseFloat(qualityParameter.trim().slice(2)) : 1;

      return {
        locale: normalizeTransactionalLocale(tag),
        quality: Number.isFinite(parsedQuality) ? parsedQuality : 0,
        index,
      };
    })
    .filter(
      (entry): entry is { locale: TransactionalLocale; quality: number; index: number } =>
        Boolean(entry.locale) && entry.quality > 0,
    )
    .sort((left, right) => right.quality - left.quality || left.index - right.index)[0]?.locale;
}

/** Persisted user preference wins; request negotiation is used for anonymous/new users. */
export function resolveTransactionalLocale(input: {
  preferredLanguage?: string | null;
  acceptLanguage?: string | readonly string[] | null;
}): TransactionalLocale {
  return (
    normalizeTransactionalLocale(input.preferredLanguage) ??
    localeFromAcceptLanguage(input.acceptLanguage) ??
    DEFAULT_LOCALE
  );
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape every interpolated value before placing it in transactional HTML. */
export function escapeEmailHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

function normalizedCurrency(currency: string, locale: TransactionalLocale): string {
  const normalized = currency.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new RangeError(transactionalMessage({ locale, key: 'internal.invalidCurrency', values: { currency } }));
  }

  return normalized;
}

/**
 * Format a value expressed in the currency's minor unit. This deliberately
 * keeps the real wallet currency: a USD wallet rendered in French becomes a
 * French-formatted USD amount, never an amount silently relabelled as euros.
 */
export function formatCurrencyMinor(input: {
  amountMinor: number;
  currency: string;
  locale: TransactionalLocale;
}): string {
  if (!Number.isFinite(input.amountMinor)) {
    throw new RangeError(transactionalMessage({ locale: input.locale, key: 'internal.nonFiniteCurrencyAmount' }));
  }

  const currency = normalizedCurrency(input.currency, input.locale);
  const formatter = new Intl.NumberFormat(INTL_LOCALE[input.locale], {
    style: 'currency',
    currency,
  });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;

  return formatter.format(input.amountMinor / 10 ** fractionDigits);
}

export function formatTransactionalDate(input: {
  value: Date | string | number;
  locale: TransactionalLocale;
  timeZone?: string | null;
}): string {
  const date = input.value instanceof Date ? input.value : new Date(input.value);

  if (!Number.isFinite(date.getTime())) {
    throw new RangeError(transactionalMessage({ locale: input.locale, key: 'internal.invalidDate' }));
  }

  const options: Intl.DateTimeFormatOptions = {
    dateStyle: 'long',
    timeZone: input.timeZone?.trim() || 'UTC',
  };

  try {
    return new Intl.DateTimeFormat(INTL_LOCALE[input.locale], options).format(date);
  } catch (error) {
    if (!(error instanceof RangeError) || options.timeZone === 'UTC') {
      throw error;
    }

    // A stale/invalid stored timezone must not prevent a critical email.
    return new Intl.DateTimeFormat(INTL_LOCALE[input.locale], { ...options, timeZone: 'UTC' }).format(date);
  }
}

function actionUrl(input: { baseUrl: string; path: string; token: string; locale: TransactionalLocale }): string {
  const url = new URL(input.path, `${input.baseUrl.replace(/\/+$/, '')}/`);
  url.searchParams.set('token', input.token);
  url.searchParams.set('lang', input.locale);

  return url.toString();
}

export function verificationEmailContent(input: {
  baseUrl: string;
  token: string;
  locale?: TransactionalLocale;
  kind?: 'email' | 'new-email';
}): TransactionalEmailContent {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const kind = input.kind ?? 'email';
  const kindKey = kind === 'new-email' ? 'newEmail' : 'email';
  const subject = transactionalMessage({ locale, key: `verification.subject.${kindKey}` });
  const opening = transactionalMessage({ locale, key: `verification.opening.${kindKey}` });
  const linkInstruction = transactionalMessage({ locale, key: 'verification.linkInstruction' });
  const tokenInstruction = transactionalMessage({ locale, key: 'verification.tokenInstruction' });
  const link = actionUrl({ baseUrl: input.baseUrl, path: '/verify-email', token: input.token, locale });
  const escapedLink = escapeEmailHtml(link);
  const escapedToken = escapeEmailHtml(input.token);

  return {
    subject,
    text: `${opening}\n\n${linkInstruction}\n${link}\n\n${tokenInstruction} ${input.token}`,
    html:
      `<p>${escapeEmailHtml(opening)}</p>` +
      `<p>${escapeEmailHtml(linkInstruction)}</p>` +
      `<p><a href="${escapedLink}">${escapedLink}</a></p>` +
      `<p>${escapeEmailHtml(tokenInstruction)} <code>${escapedToken}</code></p>`,
  };
}

export function passwordResetEmailContent(input: {
  baseUrl: string;
  token: string;
  locale?: TransactionalLocale;
}): TransactionalEmailContent {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const subject = transactionalMessage({ locale, key: 'passwordReset.subject' });
  const opening = transactionalMessage({ locale, key: 'passwordReset.opening' });
  const linkInstruction = transactionalMessage({ locale, key: 'passwordReset.linkInstruction' });
  const tokenInstruction = transactionalMessage({ locale, key: 'passwordReset.tokenInstruction' });
  const ignore = transactionalMessage({ locale, key: 'passwordReset.ignore' });
  const link = actionUrl({ baseUrl: input.baseUrl, path: '/reset-password', token: input.token, locale });
  const escapedLink = escapeEmailHtml(link);
  const escapedToken = escapeEmailHtml(input.token);

  return {
    subject,
    text: `${opening}\n\n${linkInstruction}\n${link}\n\n${tokenInstruction} ${input.token}\n\n${ignore}`,
    html:
      `<p>${escapeEmailHtml(opening)}</p>` +
      `<p>${escapeEmailHtml(linkInstruction)}</p>` +
      `<p><a href="${escapedLink}">${escapedLink}</a></p>` +
      `<p>${escapeEmailHtml(tokenInstruction)} <code>${escapedToken}</code></p>` +
      `<p>${escapeEmailHtml(ignore)}</p>`,
  };
}

export function invitationEmailContent(input: {
  baseUrl: string;
  token: string;
  locale?: TransactionalLocale;
  kind?: 'initial' | 'resend';
}): TransactionalEmailContent {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const kind = input.kind ?? 'initial';
  const subject = transactionalMessage({ locale, key: `invitation.subject.${kind}` });
  const opening = transactionalMessage({ locale, key: 'invitation.opening' });
  const linkInstruction = transactionalMessage({ locale, key: 'invitation.linkInstruction' });
  const tokenInstruction = transactionalMessage({ locale, key: 'invitation.tokenInstruction' });
  const link = actionUrl({ baseUrl: input.baseUrl, path: '/invitations/accept', token: input.token, locale });
  const escapedLink = escapeEmailHtml(link);
  const escapedToken = escapeEmailHtml(input.token);

  return {
    subject,
    text: `${opening}\n\n${linkInstruction}\n${link}\n\n${tokenInstruction} ${input.token}`,
    html:
      `<p>${escapeEmailHtml(opening)}</p>` +
      `<p>${escapeEmailHtml(linkInstruction)}</p>` +
      `<p><a href="${escapedLink}">${escapedLink}</a></p>` +
      `<p>${escapeEmailHtml(tokenInstruction)} <code>${escapedToken}</code></p>`,
  };
}

export function welcomeEmailContent(input: {
  baseUrl: string;
  locale?: TransactionalLocale;
  name?: string | null;
}): TransactionalEmailContent {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const dashboard = new URL('/dashboard', `${input.baseUrl.replace(/\/+$/, '')}/`);
  dashboard.searchParams.set('lang', locale);
  const name = input.name?.trim() || undefined;
  const subject = transactionalMessage({ locale, key: 'welcome.subject' });
  const greeting = transactionalMessage({
    locale,
    key: name ? 'welcome.greeting.named' : 'welcome.greeting.unnamed',
    values: name ? { name } : undefined,
  });
  const body = transactionalMessage({ locale, key: 'welcome.body' });
  const action = transactionalMessage({ locale, key: 'welcome.action' });
  const escapedGreeting = escapeEmailHtml(greeting);
  const escapedBody = escapeEmailHtml(body);
  const escapedAction = escapeEmailHtml(action);
  const escapedDashboard = escapeEmailHtml(dashboard.toString());

  return {
    subject,
    text: `${greeting}\n\n${body}\n\n${action}: ${dashboard.toString()}`,
    html:
      `<p>${escapedGreeting}</p>` +
      `<p>${escapedBody}</p>` +
      `<p><a href="${escapedDashboard}">${escapedAction}</a></p>`,
  };
}

export type InvoiceEmailEvent = 'finalized' | 'paid' | 'payment_failed';

const INVOICE_EVENT_KEY = {
  finalized: 'finalized',
  paid: 'paid',
  payment_failed: 'paymentFailed',
} as const satisfies Record<InvoiceEmailEvent, 'finalized' | 'paid' | 'paymentFailed'>;

function trustedInvoiceUrl(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);

    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function invoiceEmailContent(input: {
  event: InvoiceEmailEvent;
  invoiceId: string;
  invoiceNumber?: string | null;
  amountMinor: number;
  currency: string;
  createdAt: Date | string | number;
  invoiceUrl?: string | null;
  locale?: TransactionalLocale;
  timeZone?: string | null;
}): TransactionalEmailContent {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const reference = input.invoiceNumber?.trim() || input.invoiceId;
  const amount = formatCurrencyMinor({ amountMinor: input.amountMinor, currency: input.currency, locale });
  const date = formatTransactionalDate({ value: input.createdAt, locale, timeZone: input.timeZone });
  const invoiceUrl = trustedInvoiceUrl(input.invoiceUrl);
  const eventKey = INVOICE_EVENT_KEY[input.event];
  const values = { reference, amount };
  const subject = transactionalMessage({ locale, key: `invoice.subject.${eventKey}`, values });
  const lead = transactionalMessage({ locale, key: `invoice.lead.${eventKey}`, values });
  const dateLabel = transactionalMessage({ locale, key: 'invoice.date' });
  const action = transactionalMessage({ locale, key: 'invoice.action' });
  const dateLine = `${dateLabel} : ${date}`;
  const actionLine = invoiceUrl ? `\n\n${action}: ${invoiceUrl}` : '';
  const htmlAction = invoiceUrl ? `<p><a href="${escapeEmailHtml(invoiceUrl)}">${escapeEmailHtml(action)}</a></p>` : '';

  return {
    subject,
    text: `${lead}\n\n${dateLine}${actionLine}`,
    html: `<p>${escapeEmailHtml(lead)}</p>` + `<p>${escapeEmailHtml(dateLine)}</p>` + htmlAction,
  };
}

export function abuseWarningEmailContent(input: {
  eventType: string;
  locale?: TransactionalLocale;
  name?: string | null;
}): TransactionalEmailContent {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const name = input.name?.trim() || undefined;
  const subject = transactionalMessage({ locale, key: 'abuse.subject' });
  const greeting = transactionalMessage({
    locale,
    key: name ? 'abuse.greeting.named' : 'abuse.greeting.unnamed',
    values: name ? { name } : undefined,
  });
  const lead = transactionalMessage({ locale, key: 'abuse.lead', values: { eventType: input.eventType } });
  const consequence = transactionalMessage({ locale, key: 'abuse.consequence' });
  const appeal = transactionalMessage({ locale, key: 'abuse.appeal' });
  const signature = transactionalMessage({ locale, key: 'abuse.signature' });
  const paragraphs = [greeting, lead, consequence, appeal, `— ${signature}`];

  return {
    subject,
    text: paragraphs.join('\n\n'),
    html: paragraphs.map((paragraph) => `<p>${escapeEmailHtml(paragraph)}</p>`).join(''),
  };
}

export function localizedSpendAlertEmailContent(input: {
  pct: 50 | 80 | 100;
  paygSpentMinor: number;
  budgetCapMinor: number;
  currency: string;
  locale?: TransactionalLocale;
}): TransactionalEmailContent {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const spent = formatCurrencyMinor({ amountMinor: input.paygSpentMinor, currency: input.currency, locale });
  const cap = formatCurrencyMinor({ amountMinor: input.budgetCapMinor, currency: input.currency, locale });
  const atCap = input.pct >= 100;
  const values = { cap, pct: input.pct, spent };
  const subject = transactionalMessage({
    locale,
    key: atCap ? 'spend.reachedSubject' : 'spend.warningSubject',
    values,
  });
  const lead = transactionalMessage({
    locale,
    key: atCap ? 'spend.reachedLead' : 'spend.warningLead',
    values,
  });
  const action = transactionalMessage({
    locale,
    key: atCap ? 'spend.reachedAction' : 'spend.warningAction',
  });
  const actionHtml = transactionalMessage({
    locale,
    key: atCap ? 'spend.reachedActionHtml' : 'spend.warningActionHtml',
  });

  return {
    subject,
    text: `${lead}\n\n${action}`,
    html: `<p>${escapeEmailHtml(lead)}</p><p>${actionHtml}</p>`,
  };
}

function localizedDayCount(count: number, locale: TransactionalLocale): string {
  const formatted = new Intl.NumberFormat(INTL_LOCALE[locale], { maximumFractionDigits: 0 }).format(count);
  const category = new Intl.PluralRules(INTL_LOCALE[locale]).select(count);

  return transactionalMessage({
    locale,
    key: category === 'one' ? 'duration.day.one' : 'duration.day.other',
    values: { count: formatted },
  });
}

export function localizedInactivityWarningEmailContent(input: {
  daysInactive: number;
  deletionAfterDays: number;
  nowMs: number;
  locale?: TransactionalLocale;
  timeZone?: string | null;
}): TransactionalEmailContent {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const daysLeft = Math.max(0, input.deletionAfterDays - input.daysInactive);
  const inactiveDuration = localizedDayCount(input.daysInactive, locale);
  const retentionDuration = localizedDayCount(input.deletionAfterDays, locale);
  const remainingDuration = localizedDayCount(daysLeft, locale);
  const deletionDate = formatTransactionalDate({
    value: input.nowMs + daysLeft * 24 * 60 * 60 * 1000,
    locale,
    timeZone: input.timeZone,
  });
  const subject = transactionalMessage({
    locale,
    key: 'inactivity.subject',
    values: { remainingDuration },
  });
  const inactive = transactionalMessage({
    locale,
    key: 'inactivity.inactive',
    values: { inactiveDuration },
  });
  const retention = transactionalMessage({
    locale,
    key: 'inactivity.retention',
    values: { retentionDuration },
  });
  const remaining = transactionalMessage({
    locale,
    key: 'inactivity.remaining',
    values: { remainingDuration, deletionDate },
  });
  const signIn = transactionalMessage({ locale, key: 'inactivity.signIn' });
  const inactiveHtml = transactionalMessage({
    locale,
    key: 'inactivity.inactive',
    values: { inactiveDuration: `<strong>${escapeEmailHtml(inactiveDuration)}</strong>` },
  });
  const remainingHtml = transactionalMessage({
    locale,
    key: 'inactivity.remaining',
    values: {
      remainingDuration: `<strong>${escapeEmailHtml(remainingDuration)}</strong>`,
      deletionDate: escapeEmailHtml(deletionDate),
    },
  });
  return {
    subject,
    text: [inactive, retention, `${remaining} ${signIn}`].join('\n\n'),
    html:
      `<p>${inactiveHtml}</p>` +
      `<p>${escapeEmailHtml(retention)} ${remainingHtml}</p>` +
      `<p>${escapeEmailHtml(signIn)}</p>`,
  };
}

const PUBLIC_ERROR_CODES = [
  'VALIDATION_ERROR',
  'API_ERROR',
  'AUTH_REQUIRED',
  'AUTH_EMAIL_EXISTS',
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_MFA_REQUIRED',
  'AUTH_INVALID_MFA_CODE',
  'AUTH_INVALID_VERIFICATION_TOKEN',
  'AUTH_INVALID_RESET_TOKEN',
  'MFA_REQUIRED',
  'USER_NOT_FOUND',
  'USER_SUSPENDED',
  'SSO_ENFORCED',
  'OAUTH_STATE_INVALID',
  'OAUTH_PROVIDER_DISABLED',
  'OAUTH_RESOLVE_FAILED',
  'INVITE_NOT_FOUND',
  'INVITE_INVALID_TOKEN',
  'INVITE_RESEND_THROTTLED',
  'RBAC_FORBIDDEN',
] as const;

export type PublicErrorCode = (typeof PUBLIC_ERROR_CODES)[number];

const PUBLIC_ERROR_CODE_SET = new Set<string>(PUBLIC_ERROR_CODES);

function publicErrorMessageKey(code: string | null | undefined): TransactionalMessageKey | undefined {
  return code && PUBLIC_ERROR_CODE_SET.has(code) ? (`errors.${code}` as TransactionalMessageKey) : undefined;
}

/**
 * Resolve a stable public error code without ever returning the code itself.
 * The existing English message remains authoritative for English clients so
 * current API consumers retain their exact fallback wording. French clients
 * never receive an English fallback for an unregistered code: the localized
 * generic error is safer than leaking internal or untranslated copy.
 */
export function publicErrorMessage(input: {
  code?: string | null;
  locale: TransactionalLocale;
  englishFallback?: string | null;
}): string {
  const fallback = input.englishFallback?.trim() || undefined;

  if (input.locale === 'en' && fallback) {
    return fallback;
  }

  const key = publicErrorMessageKey(input.code);

  if (key) {
    return transactionalMessage({ locale: input.locale, key });
  }

  return input.locale === 'fr'
    ? transactionalMessage({ locale: input.locale, key: GENERIC_MESSAGE_KEY })
    : (fallback ?? transactionalMessage({ locale: input.locale, key: GENERIC_MESSAGE_KEY }));
}

/**
 * Localize every conventional error field emitted by an HTTP route. Older
 * endpoints did not always provide a stable code; normalize those responses to
 * API_ERROR so French clients never receive their English `error`/`message`
 * fallback while English clients retain the original wording.
 */
export function localizedPublicErrorPayload(
  payload: Readonly<Record<string, unknown>>,
  locale: TransactionalLocale,
): Readonly<Record<string, unknown>> {
  const errorFallback = typeof payload.error === 'string' ? payload.error : undefined;
  const messageFallback = typeof payload.message === 'string' ? payload.message : undefined;
  const fallback = errorFallback ?? messageFallback;

  if (!fallback) {
    return payload;
  }

  const code = typeof payload.code === 'string' && payload.code.trim() ? payload.code : 'API_ERROR';
  const localized = publicErrorMessage({ code, locale, englishFallback: fallback });

  return {
    ...payload,
    code,
    ...(errorFallback ? { error: localized } : {}),
    ...(messageFallback ? { message: localized } : {}),
  };
}

export const NOTIFICATION_MESSAGE_KEYS = {
  connectionReconnectRequired: 'notifications.connectionReconnectRequired',
} as const;

export type NotificationMessageKey = (typeof NOTIFICATION_MESSAGE_KEYS)[keyof typeof NOTIFICATION_MESSAGE_KEYS];

const LEGACY_NOTIFICATION_CATEGORIES = ['security', 'billing', 'deployments', 'team', 'system'] as const;

type LegacyNotificationCategory = (typeof LEGACY_NOTIFICATION_CATEGORIES)[number];

const LEGACY_NOTIFICATION_CATEGORY_SET = new Set<string>(LEGACY_NOTIFICATION_CATEGORIES);

export function localizedNotificationContent(input: {
  messageKey?: string | null;
  messageParams?: Readonly<Record<string, unknown>> | null;
  fallbackTitle: string;
  fallbackBody?: string | null;
  category?: string | null;
  locale: TransactionalLocale;
}): { title: string; body?: string } {
  if (input.messageKey !== NOTIFICATION_MESSAGE_KEYS.connectionReconnectRequired) {
    if (input.locale === 'fr') {
      const category =
        input.category && LEGACY_NOTIFICATION_CATEGORY_SET.has(input.category)
          ? (input.category as LegacyNotificationCategory)
          : 'system';

      return {
        title: transactionalMessage({ locale: input.locale, key: `notification.legacy.${category}.title` }),
        body: transactionalMessage({ locale: input.locale, key: `notification.legacy.${category}.body` }),
      };
    }

    return { title: input.fallbackTitle, body: input.fallbackBody ?? undefined };
  }

  const providerValue = input.messageParams?.provider;
  const provider = typeof providerValue === 'string' && providerValue.trim() ? providerValue.trim() : undefined;
  const providerForTitle =
    provider ?? transactionalMessage({ locale: input.locale, key: 'notification.connection.defaultProvider' });
  const accountValue = input.messageParams?.accountLabel;
  const accountLabel = typeof accountValue === 'string' && accountValue.trim() ? accountValue.trim() : undefined;

  return {
    title: transactionalMessage({
      locale: input.locale,
      key: 'notification.connection.title',
      values: { provider: providerForTitle },
    }),
    body: transactionalMessage({
      locale: input.locale,
      key: provider
        ? accountLabel
          ? 'notification.connection.body.withAccount'
          : 'notification.connection.body.withoutAccount'
        : 'notification.connection.body.withoutProvider',
      values: { provider, accountLabel },
    }),
  };
}
