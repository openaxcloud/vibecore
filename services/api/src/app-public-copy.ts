import rawCatalogue from './app-public-copy.json' with { type: 'json' };
import type { TransactionalLocale } from './transactional-i18n.js';

type LocaleCopy = Readonly<{
  en: string;
  fr: string;
}>;

type InterpolationValues = Readonly<Record<string, string | number | boolean | null | undefined>>;

export type AppPublicCopyKey = keyof typeof rawCatalogue;

const catalogue: Readonly<Record<AppPublicCopyKey, LocaleCopy>> = rawCatalogue;
const catalogueKeys = Object.keys(catalogue) as AppPublicCopyKey[];
const englishKeyIndex = new Map(catalogueKeys.map((key) => [catalogue[key].en, key] as const));
const frenchKeyIndex = new Map(catalogueKeys.map((key) => [catalogue[key].fr, key] as const));

type DynamicTemplate = Readonly<{
  key: AppPublicCopyKey;
  names: readonly string[];
  pattern: RegExp;
}>;

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compileDynamicTemplate(key: AppPublicCopyKey, locale: TransactionalLocale): DynamicTemplate | undefined {
  const template = catalogue[key][locale];
  const placeholder = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;
  const names: string[] = [];
  const chunks: string[] = ['^'];
  let cursor = 0;

  for (const match of template.matchAll(placeholder)) {
    const index = match.index ?? 0;
    chunks.push(escapeRegularExpression(template.slice(cursor, index)), '([\\s\\S]*?)');
    names.push(match[1] ?? '');
    cursor = index + match[0].length;
  }

  if (names.length === 0) {
    return undefined;
  }

  chunks.push(escapeRegularExpression(template.slice(cursor)), '$');
  return { key, names, pattern: new RegExp(chunks.join(''), 'u') };
}

const dynamicEnglishTemplates = catalogueKeys
  .map((key) => compileDynamicTemplate(key, 'en'))
  .filter((entry): entry is DynamicTemplate => Boolean(entry));
const dynamicFrenchTemplates = catalogueKeys
  .map((key) => compileDynamicTemplate(key, 'fr'))
  .filter((entry): entry is DynamicTemplate => Boolean(entry));
const dynamicTemplatesByLocale: Readonly<Record<TransactionalLocale, readonly DynamicTemplate[]>> = {
  en: dynamicEnglishTemplates,
  fr: [...dynamicEnglishTemplates, ...dynamicFrenchTemplates],
};

function isAppPublicCopyKey(value: unknown): value is AppPublicCopyKey {
  return typeof value === 'string' && Object.hasOwn(catalogue, value);
}

function interpolate(template: string, values: InterpolationValues): string {
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, name: string) => {
    if (!Object.hasOwn(values, name)) {
      return placeholder;
    }

    const value = values[name];
    return value === null || value === undefined ? '' : String(value);
  });
}

/**
 * Resolve backend-owned copy without ever exposing a catalogue key. The
 * generic request failure is the final runtime fallback for a stale/invalid
 * key; TypeScript prevents that situation for normal callers.
 */
export function appPublicCopy(
  key: AppPublicCopyKey,
  locale: TransactionalLocale,
  values: InterpolationValues = {},
): string {
  const entry = isAppPublicCopyKey(key) ? catalogue[key] : catalogue.GENERIC_REQUEST_FAILED;
  return interpolate(entry[locale] ?? entry.en, values);
}

/** Keep internal errors and English API contracts externalized too. */
export function appPublicEnglish(key: AppPublicCopyKey, values: InterpolationValues = {}): string {
  return appPublicCopy(key, 'en', values);
}

export type LocalizedAppPublicMessage = Readonly<{
  matched: boolean;
  value: string;
}>;

/** Match exact or fully anchored backend templates; arbitrary substrings and user content remain untouched. */
export function localizeAppPublicMessage(message: unknown, locale: TransactionalLocale): LocalizedAppPublicMessage {
  if (typeof message !== 'string') {
    return { matched: false, value: appPublicCopy('GENERIC_REQUEST_FAILED', locale) };
  }

  const key = englishKeyIndex.get(message) ?? (locale === 'fr' ? frenchKeyIndex.get(message) : undefined);

  if (key) {
    return { matched: true, value: appPublicCopy(key, locale) };
  }

  for (const template of dynamicTemplatesByLocale[locale]) {
    const match = template.pattern.exec(message);

    if (!match) {
      continue;
    }

    const values = Object.fromEntries(template.names.map((name, index) => [name, match[index + 1] ?? '']));
    return { matched: true, value: appPublicCopy(template.key, locale, values) };
  }

  return { matched: false, value: message };
}

type CreditLedgerKind = 'ADJUSTMENT' | 'CONSUMPTION' | 'EXPIRY' | 'GRANT' | 'PAYG_CHARGE' | string;

const deploymentCreditReasons = new Set(['autoscale', 'scheduled', 'static', 'reserved-vm']);
const creditPlanKeys = new Set(['starter', 'core', 'pro', 'enterprise']);

function localizeConsumptionReason(reason: string, locale: TransactionalLocale): string | undefined {
  const exactKeys: Readonly<Record<string, AppPublicCopyKey>> = {
    'workspace compute': 'USAGE_WORKSPACE_COMPUTE',
    'object storage': 'USAGE_OBJECT_STORAGE',
    'database compute': 'CREDIT_LEDGER_DATABASE_COMPUTE',
    'database storage': 'CREDIT_LEDGER_DATABASE_STORAGE',
    'agent checkpoint': 'CREDIT_LEDGER_AGENT_CHECKPOINT',
  };
  const exactKey = exactKeys[reason];

  if (exactKey) {
    return appPublicCopy(exactKey, locale);
  }

  const deployment = /^deployment ([a-z-]+)$/u.exec(reason);

  if (deployment?.[1] && deploymentCreditReasons.has(deployment[1])) {
    return appPublicCopy('CREDIT_LEDGER_DEPLOYMENT', locale, { kind: deployment[1] });
  }

  return undefined;
}

/**
 * Localize only reasons generated by the credit-metering platform. Operator
 * adjustments and unknown values are user-authored audit data and must remain
 * byte-for-byte intact, even when they happen to contain English words.
 */
export function localizeCreditLedgerReason(
  reason: string,
  kind: CreditLedgerKind,
  locale: TransactionalLocale,
): string {
  if (kind === 'ADJUSTMENT') {
    return reason;
  }

  if (kind === 'PAYG_CHARGE') {
    return reason === 'PAYG overage (billed to Stripe metered usage)'
      ? appPublicCopy('CREDIT_LEDGER_PAYG_OVERAGE', locale)
      : reason;
  }

  if (kind === 'EXPIRY') {
    const key =
      reason === 'rollover cap exceeded'
        ? 'CREDIT_LEDGER_ROLLOVER_CAP_EXCEEDED'
        : reason === 'prior grant expired (no rollover)'
          ? 'CREDIT_LEDGER_PRIOR_GRANT_EXPIRED'
          : undefined;

    return key ? appPublicCopy(key, locale) : reason;
  }

  if (kind === 'GRANT') {
    const grant = /^(starter|core|pro|enterprise) (monthly|daily) grant$/u.exec(reason);
    const plan = grant?.[1];
    const period = grant?.[2];

    if (plan && period && creditPlanKeys.has(plan)) {
      return appPublicCopy(period === 'monthly' ? 'CREDIT_LEDGER_MONTHLY_GRANT' : 'CREDIT_LEDGER_DAILY_GRANT', locale, {
        plan,
      });
    }

    return reason;
  }

  if (kind !== 'CONSUMPTION') {
    return reason;
  }

  const overdrawSuffix = ' (overdraw reversal)';
  const isOverdrawReversal = reason.endsWith(overdrawSuffix);
  const baseReason = isOverdrawReversal ? reason.slice(0, -overdrawSuffix.length) : reason;
  const localized = localizeConsumptionReason(baseReason, locale);

  if (!localized) {
    return reason;
  }

  return isOverdrawReversal ? `${localized} (${appPublicCopy('CREDIT_LEDGER_OVERDRAW_REVERSAL', locale)})` : localized;
}

export type LocalizedAppPublicPayload = Readonly<{
  handled: boolean;
  payload: Readonly<Record<string, unknown>>;
}>;

/**
 * Localize the conventional top-level error/message fields and the nested
 * `{ error: { message } }` shape used by WebSocket/share endpoints. Unknown
 * nested French errors are masked rather than leaking upstream technical text.
 */
export function localizeAppPublicErrorPayload(
  payload: Readonly<Record<string, unknown>>,
  locale: TransactionalLocale,
): LocalizedAppPublicPayload {
  const localizedPayload: Record<string, unknown> = { ...payload };
  let handled = false;

  for (const field of ['error', 'message'] as const) {
    const source = payload[field];

    if (typeof source === 'string') {
      const localized = localizeAppPublicMessage(source, locale);

      if (localized.matched) {
        localizedPayload[field] = localized.value;
        handled = true;
      }
    }
  }

  if (payload.error && typeof payload.error === 'object' && !Array.isArray(payload.error)) {
    const nestedError = payload.error as Readonly<Record<string, unknown>>;

    if (typeof nestedError.message === 'string') {
      const localized = localizeAppPublicMessage(nestedError.message, locale);
      localizedPayload.error = {
        ...nestedError,
        message:
          localized.matched || locale === 'en' ? localized.value : appPublicCopy('GENERIC_REQUEST_FAILED', locale),
      };
      handled = true;
    }
  }

  return { handled, payload: localizedPayload };
}

type PublicValidationIssue = Readonly<{
  code?: unknown;
  maximum?: unknown;
  message?: unknown;
  minimum?: unknown;
}>;

function validationBoundary(value: unknown): string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : '';
}

function validationFallback(issue: PublicValidationIssue): {
  key: AppPublicCopyKey;
  values?: InterpolationValues;
} {
  switch (issue.code) {
    case 'invalid_type':
      return { key: 'VALIDATION_TYPE_INVALID' };
    case 'too_small':
      return { key: 'VALIDATION_TOO_SMALL', values: { minimum: validationBoundary(issue.minimum) } };
    case 'too_big':
      return { key: 'VALIDATION_TOO_BIG', values: { maximum: validationBoundary(issue.maximum) } };
    case 'invalid_format':
      return { key: 'VALIDATION_INVALID_FORMAT' };
    case 'unrecognized_keys':
      return { key: 'VALIDATION_UNRECOGNIZED_KEYS' };
    default:
      return { key: 'VALIDATION_VALUE_INVALID' };
  }
}

/** Preserve issue paths/codes while guaranteeing that French responses contain no raw English issue text. */
export function localizeAppValidationIssues(
  issues: readonly unknown[],
  locale: TransactionalLocale,
): readonly unknown[] {
  if (locale === 'en') {
    return issues;
  }

  return issues.map((rawIssue) => {
    if (!rawIssue || typeof rawIssue !== 'object' || Array.isArray(rawIssue)) {
      return rawIssue;
    }

    const issue = rawIssue as PublicValidationIssue;
    const exact = localizeAppPublicMessage(issue.message, locale);
    const fallback = validationFallback(issue);

    return {
      ...issue,
      message: exact.matched ? exact.value : appPublicCopy(fallback.key, locale, fallback.values),
    };
  });
}

export function appPublicCopyKeys(): readonly AppPublicCopyKey[] {
  return catalogueKeys;
}
