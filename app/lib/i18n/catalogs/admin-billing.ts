import { normalizeSupportedLanguage, type SupportedLanguage } from '~/lib/i18n/language';
import { formatUserAreaDate, formatUserAreaNumber } from '~/lib/i18n/user-area-locale';

export type AdminBillingLanguage = 'en' | 'fr';
export type AdminBillingMutationPhase = 'reauth' | 'quota' | 'plan';

export const adminBillingEn = {
  'adminBilling.meta.title': 'Billing administration — E-Code Admin',
  'adminBilling.meta.description': 'Review E-Code plans and subscriptions, and create audited quota or plan overrides.',
  'adminBilling.page.title': 'Billing administration',
  'adminBilling.page.description':
    'Review configured plans and recent subscriptions, then create audited quota or plan overrides for enterprise organizations.',
  'adminBilling.quota.title': 'Create a quota override',
  'adminBilling.quota.description':
    'Set a non-negative limit for one organization and quota key. The reason is recorded in the administration audit log.',
  'adminBilling.planOverride.title': 'Apply a plan override',
  'adminBilling.planOverride.description':
    'Assign a configured billing plan to one organization. This change is recorded with the reason you provide.',
  'adminBilling.field.organizationId': 'Organization ID',
  'adminBilling.field.quotaKey': 'Quota key',
  'adminBilling.field.limit': 'Limit',
  'adminBilling.field.reason': 'Reason',
  'adminBilling.field.quotaReasonPlaceholder': 'Contract expansion',
  'adminBilling.field.planReasonPlaceholder': 'Contract correction',
  'adminBilling.field.password': 'Confirm with your password',
  'adminBilling.field.plan': 'Plan',
  'adminBilling.field.planUnavailable': 'No configured plan is available',
  'adminBilling.field.planOption': '{name} — {price}',
  'adminBilling.action.createQuota': 'Create quota override',
  'adminBilling.action.creatingQuota': 'Creating quota override…',
  'adminBilling.action.applyPlan': 'Apply plan override',
  'adminBilling.action.applyingPlan': 'Applying plan override…',
  'adminBilling.plans.title': 'Configured plans',
  'adminBilling.plans.count_one': '{count} configured plan',
  'adminBilling.plans.count_other': '{count} configured plans',
  'adminBilling.plans.empty': 'No billing plans are configured.',
  'adminBilling.plans.monthlyPrice': '{amount} per month',
  'adminBilling.subscriptions.title': 'Recent subscriptions',
  'adminBilling.subscriptions.count_one': '{count} recent subscription',
  'adminBilling.subscriptions.count_other': '{count} recent subscriptions',
  'adminBilling.subscriptions.empty': 'No subscriptions have been recorded yet.',
  'adminBilling.subscriptions.organization': 'Organization',
  'adminBilling.subscriptions.plan': 'Plan',
  'adminBilling.subscriptions.status': 'Status',
  'adminBilling.subscriptions.stripeId': 'Stripe subscription',
  'adminBilling.subscriptions.periodEnd': 'Period end',
  'adminBilling.subscriptions.manual': 'Manual',
  'adminBilling.subscriptions.dateNotSet': 'Not set',
  'adminBilling.subscriptions.dateInvalid': 'Date unavailable',
  'adminBilling.subscriptions.cancellationScheduled': 'Cancellation scheduled',
  'adminBilling.subscriptions.status.trialing': 'Trial',
  'adminBilling.subscriptions.status.active': 'Active',
  'adminBilling.subscriptions.status.pastDue': 'Past due',
  'adminBilling.subscriptions.status.canceled': 'Canceled',
  'adminBilling.subscriptions.status.unpaid': 'Unpaid',
  'adminBilling.subscriptions.status.unknown': 'Unknown status',
  'adminBilling.success.quotaCreated': 'Quota override created.',
  'adminBilling.success.planCreated': 'Plan override applied.',
  'adminBilling.error.invalidIntent': 'Select a supported billing change.',
  'adminBilling.error.passwordRequired': 'Enter your password to confirm this billing change.',
  'adminBilling.error.organizationRequired': 'Enter an organization ID.',
  'adminBilling.error.quotaKeyRequired': 'Enter a quota key.',
  'adminBilling.error.limitRequired': 'Enter a quota limit.',
  'adminBilling.error.invalidLimit': 'Enter a non-negative whole-number quota limit.',
  'adminBilling.error.planRequired': 'Select a plan.',
  'adminBilling.error.reasonRequired': 'Enter a reason for this plan override.',
  'adminBilling.error.incorrectPassword': 'Incorrect password. Re-enter it to confirm this billing change.',
  'adminBilling.error.reauthExpired': 'Re-authentication expired. Enter your password and submit again.',
  'adminBilling.error.platformAdminRequired': 'This action requires a platform administrator account.',
  'adminBilling.error.requestRejected': 'The request was rejected. Check your permissions and try again.',
  'adminBilling.error.invalidChange': 'The billing change was rejected. Check the values and try again.',
  'adminBilling.error.resourceNotFound':
    'The organization, plan or quota resource is no longer available. Reload the page and try again.',
  'adminBilling.error.conflict': 'Billing data changed during this request. Reload the page and try again.',
  'adminBilling.error.rateLimited': 'Too many requests. Wait a moment and try again.',
  'adminBilling.error.quotaSaveFailed': 'The quota override could not be created. Try again.',
  'adminBilling.error.planSaveFailed': 'The plan override could not be applied. Try again.',
  'adminBilling.error.serviceUnavailable': 'The billing service is not reachable. Try again in a moment.',
  'adminBilling.audit.defaultQuotaReason': 'Administration billing override',
} as const;

export type AdminBillingKey = keyof typeof adminBillingEn;
export type AdminBillingCopy = Readonly<Record<AdminBillingKey, string>>;

export const adminBillingFr: AdminBillingCopy = {
  'adminBilling.meta.title': 'Administration de la facturation — Administration E-Code',
  'adminBilling.meta.description':
    'Consultez les offres et abonnements E-Code, puis créez des dérogations auditées de quota ou d’offre.',
  'adminBilling.page.title': 'Administration de la facturation',
  'adminBilling.page.description':
    'Consultez les offres configurées et les abonnements récents, puis créez des dérogations auditées de quota ou d’offre pour les organisations Enterprise.',
  'adminBilling.quota.title': 'Créer une dérogation de quota',
  'adminBilling.quota.description':
    'Définissez une limite entière positive ou nulle pour une organisation et une clé de quota. Le motif est enregistré dans le journal d’audit de l’administration.',
  'adminBilling.planOverride.title': 'Appliquer une dérogation d’offre',
  'adminBilling.planOverride.description':
    'Attribuez une offre de facturation configurée à une organisation. Cette modification est enregistrée avec le motif que vous fournissez.',
  'adminBilling.field.organizationId': 'ID de l’organisation',
  'adminBilling.field.quotaKey': 'Clé de quota',
  'adminBilling.field.limit': 'Limite',
  'adminBilling.field.reason': 'Motif',
  'adminBilling.field.quotaReasonPlaceholder': 'Extension contractuelle',
  'adminBilling.field.planReasonPlaceholder': 'Correction contractuelle',
  'adminBilling.field.password': 'Confirmez avec votre mot de passe',
  'adminBilling.field.plan': 'Offre',
  'adminBilling.field.planUnavailable': 'Aucune offre configurée n’est disponible',
  'adminBilling.field.planOption': '{name} — {price}',
  'adminBilling.action.createQuota': 'Créer la dérogation de quota',
  'adminBilling.action.creatingQuota': 'Création de la dérogation de quota…',
  'adminBilling.action.applyPlan': 'Appliquer la dérogation d’offre',
  'adminBilling.action.applyingPlan': 'Application de la dérogation d’offre…',
  'adminBilling.plans.title': 'Offres configurées',
  'adminBilling.plans.count_one': '{count} offre configurée',
  'adminBilling.plans.count_other': '{count} offres configurées',
  'adminBilling.plans.empty': 'Aucune offre de facturation n’est configurée.',
  'adminBilling.plans.monthlyPrice': '{amount} par mois',
  'adminBilling.subscriptions.title': 'Abonnements récents',
  'adminBilling.subscriptions.count_one': '{count} abonnement récent',
  'adminBilling.subscriptions.count_other': '{count} abonnements récents',
  'adminBilling.subscriptions.empty': 'Aucun abonnement n’a encore été enregistré.',
  'adminBilling.subscriptions.organization': 'Organisation',
  'adminBilling.subscriptions.plan': 'Offre',
  'adminBilling.subscriptions.status': 'Statut',
  'adminBilling.subscriptions.stripeId': 'Abonnement Stripe',
  'adminBilling.subscriptions.periodEnd': 'Fin de période',
  'adminBilling.subscriptions.manual': 'Manuel',
  'adminBilling.subscriptions.dateNotSet': 'Non définie',
  'adminBilling.subscriptions.dateInvalid': 'Date indisponible',
  'adminBilling.subscriptions.cancellationScheduled': 'Résiliation programmée',
  'adminBilling.subscriptions.status.trialing': 'Période d’essai',
  'adminBilling.subscriptions.status.active': 'Actif',
  'adminBilling.subscriptions.status.pastDue': 'Paiement en retard',
  'adminBilling.subscriptions.status.canceled': 'Résilié',
  'adminBilling.subscriptions.status.unpaid': 'Impayé',
  'adminBilling.subscriptions.status.unknown': 'Statut inconnu',
  'adminBilling.success.quotaCreated': 'Dérogation de quota créée.',
  'adminBilling.success.planCreated': 'Dérogation d’offre appliquée.',
  'adminBilling.error.invalidIntent': 'Sélectionnez une modification de facturation prise en charge.',
  'adminBilling.error.passwordRequired':
    'Saisissez votre mot de passe pour confirmer cette modification de facturation.',
  'adminBilling.error.organizationRequired': 'Saisissez un ID d’organisation.',
  'adminBilling.error.quotaKeyRequired': 'Saisissez une clé de quota.',
  'adminBilling.error.limitRequired': 'Saisissez une limite de quota.',
  'adminBilling.error.invalidLimit': 'Saisissez une limite de quota entière, positive ou nulle.',
  'adminBilling.error.planRequired': 'Sélectionnez une offre.',
  'adminBilling.error.reasonRequired': 'Saisissez un motif pour cette dérogation d’offre.',
  'adminBilling.error.incorrectPassword':
    'Mot de passe incorrect. Saisissez-le de nouveau pour confirmer cette modification de facturation.',
  'adminBilling.error.reauthExpired':
    'La réauthentification a expiré. Saisissez votre mot de passe, puis renvoyez le formulaire.',
  'adminBilling.error.platformAdminRequired': 'Cette action nécessite un compte administrateur de la plateforme.',
  'adminBilling.error.requestRejected': 'La requête a été refusée. Vérifiez vos autorisations, puis réessayez.',
  'adminBilling.error.invalidChange':
    'La modification de facturation a été refusée. Vérifiez les valeurs, puis réessayez.',
  'adminBilling.error.resourceNotFound':
    'L’organisation, l’offre ou la ressource de quota n’est plus disponible. Rechargez la page, puis réessayez.',
  'adminBilling.error.conflict':
    'Les données de facturation ont changé pendant la requête. Rechargez la page, puis réessayez.',
  'adminBilling.error.rateLimited': 'Trop de requêtes ont été envoyées. Patientez un instant, puis réessayez.',
  'adminBilling.error.quotaSaveFailed': 'Impossible de créer la dérogation de quota. Réessayez.',
  'adminBilling.error.planSaveFailed': 'Impossible d’appliquer la dérogation d’offre. Réessayez.',
  'adminBilling.error.serviceUnavailable': 'Le service de facturation est inaccessible. Réessayez dans un instant.',
  'adminBilling.audit.defaultQuotaReason': 'Dérogation de facturation créée par l’administration',
};

export const ADMIN_BILLING_STATUS_CODES = ['quotaCreated', 'planCreated'] as const;
export type AdminBillingStatusCode = (typeof ADMIN_BILLING_STATUS_CODES)[number];

export const ADMIN_BILLING_ERROR_CODES = [
  'invalidIntent',
  'passwordRequired',
  'organizationRequired',
  'quotaKeyRequired',
  'limitRequired',
  'invalidLimit',
  'planRequired',
  'reasonRequired',
  'incorrectPassword',
  'reauthExpired',
  'platformAdminRequired',
  'requestRejected',
  'invalidChange',
  'resourceNotFound',
  'conflict',
  'rateLimited',
  'quotaSaveFailed',
  'planSaveFailed',
  'serviceUnavailable',
] as const;
export type AdminBillingErrorCode = (typeof ADMIN_BILLING_ERROR_CODES)[number];

export type AdminBillingIntent = 'quota' | 'plan';

export type AdminBillingMessageData = Readonly<{
  statusCode?: AdminBillingStatusCode;
  errorCode?: AdminBillingErrorCode;
}>;

const SUBSCRIPTION_STATUS_KEYS = {
  TRIALING: 'adminBilling.subscriptions.status.trialing',
  ACTIVE: 'adminBilling.subscriptions.status.active',
  PAST_DUE: 'adminBilling.subscriptions.status.pastDue',
  CANCELED: 'adminBilling.subscriptions.status.canceled',
  UNPAID: 'adminBilling.subscriptions.status.unpaid',
} as const satisfies Readonly<Record<string, AdminBillingKey>>;

export function resolveAdminBillingLanguage(language?: string | null): AdminBillingLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

function supportedLanguage(language?: string | null): SupportedLanguage {
  return resolveAdminBillingLanguage(language);
}

function locale(language?: string | null): string {
  return resolveAdminBillingLanguage(language) === 'fr' ? 'fr-FR' : 'en-GB';
}

export function getAdminBillingCopy(language?: string | null): AdminBillingCopy {
  return resolveAdminBillingLanguage(language) === 'fr' ? adminBillingFr : adminBillingEn;
}

export function formatAdminBillingCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

function pluralSuffix(count: number, language?: string | null): 'one' | 'other' {
  return new Intl.PluralRules(locale(language)).select(count) === 'one' ? 'one' : 'other';
}

export function formatAdminBillingNumber(value: number | bigint, language?: string | null): string {
  return formatUserAreaNumber(value, undefined, supportedLanguage(language));
}

export function formatAdminBillingCurrency(cents: number, currency = 'EUR', language?: string | null): string {
  const normalizedCurrency = /^[A-Za-z]{3}$/u.test(currency) ? currency.toUpperCase() : 'EUR';

  return formatUserAreaNumber(
    cents / 100,
    {
      style: 'currency',
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
    supportedLanguage(language),
  );
}

export function formatAdminBillingMonthlyPrice(cents: number, language?: string | null): string {
  const copy = getAdminBillingCopy(language);

  return formatAdminBillingCopy(copy['adminBilling.plans.monthlyPrice'], {
    amount: formatAdminBillingCurrency(cents, 'EUR', language),
  });
}

export function formatAdminBillingDate(value: string, language?: string | null): string {
  return (
    formatUserAreaDate(
      value,
      { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' },
      supportedLanguage(language),
    ) ?? getAdminBillingCopy(language)['adminBilling.subscriptions.dateInvalid']
  );
}

export function formatAdminBillingPlanCount(count: number, language?: string | null): string {
  const copy = getAdminBillingCopy(language);
  const suffix = pluralSuffix(count, language);

  return formatAdminBillingCopy(copy[`adminBilling.plans.count_${suffix}`], {
    count: formatAdminBillingNumber(count, language),
  });
}

export function formatAdminBillingSubscriptionCount(count: number, language?: string | null): string {
  const copy = getAdminBillingCopy(language);
  const suffix = pluralSuffix(count, language);

  return formatAdminBillingCopy(copy[`adminBilling.subscriptions.count_${suffix}`], {
    count: formatAdminBillingNumber(count, language),
  });
}

export function getAdminBillingSubscriptionStatus(status: string, language?: string | null): string {
  const copy = getAdminBillingCopy(language);
  const key = (SUBSCRIPTION_STATUS_KEYS as Readonly<Record<string, AdminBillingKey>>)[status.toUpperCase()];

  return key ? copy[key] : copy['adminBilling.subscriptions.status.unknown'];
}

export function formatAdminBillingStatus(data: AdminBillingMessageData, language?: string | null): string | undefined {
  if (!data.statusCode) {
    return undefined;
  }

  const copy = getAdminBillingCopy(language);

  return copy[
    data.statusCode === 'quotaCreated' ? 'adminBilling.success.quotaCreated' : 'adminBilling.success.planCreated'
  ];
}

export function formatAdminBillingError(data: AdminBillingMessageData, language?: string | null): string | undefined {
  return data.errorCode ? getAdminBillingCopy(language)[`adminBilling.error.${data.errorCode}`] : undefined;
}

export async function resolveAdminBillingErrorCode(
  error: unknown,
  phase: AdminBillingMutationPhase,
): Promise<AdminBillingErrorCode> {
  if (!(error instanceof Response)) {
    return 'serviceUnavailable';
  }

  let code: string | undefined;

  try {
    const payload = (await error.clone().json()) as { code?: unknown };
    code = typeof payload.code === 'string' ? payload.code : undefined;
  } catch {
    code = undefined;
  }

  if (code === 'ADMIN_REAUTH_REQUIRED') {
    return 'reauthExpired';
  }

  if (code === 'PLATFORM_ADMIN_REQUIRED') {
    return 'platformAdminRequired';
  }

  if (error.status === 401) {
    return phase === 'reauth' ? 'incorrectPassword' : 'requestRejected';
  }

  if (error.status === 403) {
    return 'requestRejected';
  }

  if (error.status === 400 || error.status === 422) {
    return 'invalidChange';
  }

  if (error.status === 404) {
    return 'resourceNotFound';
  }

  if (error.status === 409) {
    return 'conflict';
  }

  if (error.status === 429) {
    return 'rateLimited';
  }

  return phase === 'quota' ? 'quotaSaveFailed' : phase === 'plan' ? 'planSaveFailed' : 'serviceUnavailable';
}

export function adminBillingInlineStatus(error: unknown): number {
  if (error instanceof Response && error.status >= 400 && error.status < 500) {
    return error.status;
  }

  return 502;
}
