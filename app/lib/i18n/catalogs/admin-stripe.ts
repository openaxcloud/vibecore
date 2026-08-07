import { normalizeSupportedLanguage, type SupportedLanguage } from '~/lib/i18n/language';
import { formatUserAreaDateTime, formatUserAreaNumber, USER_AREA_TIME_ZONE } from '~/lib/i18n/user-area-locale';

export type AdminStripeLanguage = 'en' | 'fr';
export type AdminStripeMutationPhase = 'reauth' | 'save' | 'replay';

export const adminStripeEn = {
  'adminStripe.meta.title': 'Stripe configuration — E-Code Admin',
  'adminStripe.meta.description':
    'Configure encrypted Stripe credentials, per-plan price IDs and failed webhook replays for E-Code.',
  'adminStripe.page.title': 'Stripe configuration',
  'adminStripe.page.description':
    'Enter the live Stripe secret key and webhook signing secret, which are encrypted and write-only, then configure each plan’s price IDs. Billing checks these values first and falls back to the API service environment, so leaving a secret blank keeps the current value.',
  'adminStripe.section.secrets.title': 'Secrets',
  'adminStripe.status.secretKeySet': 'Secret key set',
  'adminStripe.status.secretKeyDatabaseMissing': 'No database secret key',
  'adminStripe.status.webhookSecretSet': 'Webhook secret set',
  'adminStripe.status.webhookSecretDatabaseMissing': 'No database webhook secret',
  'adminStripe.status.live': 'Stripe live',
  'adminStripe.status.notConfigured': 'Stripe not configured',
  'adminStripe.environment.present': 'present',
  'adminStripe.environment.absent': 'absent',
  'adminStripe.environment.summary':
    'Environment fallback — secret key: {secretKeyStatus}; webhook secret: {webhookSecretStatus}. Saving a value here overrides its environment fallback.',
  'adminStripe.field.secretKey': 'Secret key (sk_live_…)',
  'adminStripe.field.secretKeyKeep': 'Secret key (leave blank to keep the current value)',
  'adminStripe.field.secretKeyPlaceholder': 'sk_live_…',
  'adminStripe.field.webhookSecret': 'Webhook signing secret (whsec_…)',
  'adminStripe.field.webhookSecretKeep': 'Webhook signing secret (leave blank to keep the current value)',
  'adminStripe.field.webhookSecretPlaceholder': 'whsec_…',
  'adminStripe.field.secretKeepPlaceholder': '•••••••• (unchanged)',
  'adminStripe.section.prices.title': 'Plan price IDs',
  'adminStripe.section.prices.empty': 'No billing plans are available.',
  'adminStripe.field.productId': 'Product ID',
  'adminStripe.field.legacyPriceId': 'Price ID (legacy or monthly fallback)',
  'adminStripe.field.monthlyPriceId': 'Monthly price ID',
  'adminStripe.field.annualPriceId': 'Annual price ID',
  'adminStripe.field.productIdPlaceholder': 'prod_…',
  'adminStripe.field.priceIdPlaceholder': 'price_…',
  'adminStripe.field.password': 'Confirm with your password',
  'adminStripe.action.save': 'Save Stripe configuration',
  'adminStripe.action.saving': 'Saving Stripe configuration…',
  'adminStripe.section.webhooks.title': 'Failed webhooks',
  'adminStripe.webhooks.status.healthy': 'All deliveries processed',
  'adminStripe.webhooks.status.unresolved_one': '{count} unresolved delivery',
  'adminStripe.webhooks.status.unresolved_other': '{count} unresolved deliveries',
  'adminStripe.webhooks.description':
    'Stripe events whose processing failed after delivery. Replaying runs the stored event through the same webhook-processing path; a successful replay marks the delivery as resolved.',
  'adminStripe.webhooks.empty': 'No failed webhooks.',
  'adminStripe.webhooks.table.event': 'Event',
  'adminStripe.webhooks.table.type': 'Type',
  'adminStripe.webhooks.table.attempts': 'Attempts',
  'adminStripe.webhooks.table.lastError': 'Last error',
  'adminStripe.webhooks.table.failedAt': 'Failed',
  'adminStripe.webhooks.table.actions': 'Actions',
  'adminStripe.webhooks.attempts_one': '{count} attempt',
  'adminStripe.webhooks.attempts_other': '{count} attempts',
  'adminStripe.webhooks.failure.masked':
    'Processing failed. Use the Stripe event ID to correlate this delivery with the server logs.',
  'adminStripe.webhooks.dateUnavailable': 'Date unavailable',
  'adminStripe.action.replay': 'Replay',
  'adminStripe.action.replaying': 'Replaying…',
  'adminStripe.action.replayAll': 'Replay all failed deliveries',
  'adminStripe.action.replayingAll': 'Replaying all failed deliveries…',
  'adminStripe.success.configurationSaved': 'Stripe configuration saved.',
  'adminStripe.success.webhookReplayed': 'Webhook {eventId} replayed successfully.',
  'adminStripe.success.noFailedWebhooks': 'No failed webhooks to replay.',
  'adminStripe.success.webhooksReplayed_one': '{count} webhook replayed successfully.',
  'adminStripe.success.webhooksReplayed_other': '{count} webhooks replayed successfully.',
  'adminStripe.error.eventIdRequired': 'Select a webhook event to replay.',
  'adminStripe.error.passwordRequired': 'Enter your password to confirm this change.',
  'adminStripe.error.incorrectPassword': 'Incorrect password. Re-enter it to confirm this change.',
  'adminStripe.error.reauthExpired': 'Re-authentication expired. Enter your password and submit again.',
  'adminStripe.error.platformAdminRequired': 'This action requires a platform administrator account.',
  'adminStripe.error.requestRejected': 'The request was rejected. Check your permissions and try again.',
  'adminStripe.error.invalidConfiguration': 'The Stripe configuration was rejected. Check the values and try again.',
  'adminStripe.error.webhookFailureNotFound':
    'This failed webhook is no longer available. Reload the page to view the current deliveries.',
  'adminStripe.error.conflict': 'The Stripe configuration changed during this request. Reload the page and try again.',
  'adminStripe.error.rateLimited': 'Too many requests. Wait a moment and try again.',
  'adminStripe.error.replayFailed':
    'Webhook {eventId} failed again. Use its Stripe event ID to inspect the server logs before retrying.',
  'adminStripe.error.partialReplay.one_one':
    '{replayed} webhook replayed successfully; {failed} failed again. Inspect the server logs before retrying.',
  'adminStripe.error.partialReplay.one_other':
    '{replayed} webhook replayed successfully; {failed} failed again. Inspect the server logs before retrying.',
  'adminStripe.error.partialReplay.other_one':
    '{replayed} webhooks replayed successfully; {failed} failed again. Inspect the server logs before retrying.',
  'adminStripe.error.partialReplay.other_other':
    '{replayed} webhooks replayed successfully; {failed} failed again. Inspect the server logs before retrying.',
  'adminStripe.error.saveFailed': 'The Stripe configuration could not be saved. Try again.',
  'adminStripe.error.replayUnavailable': 'The webhook replay could not be completed. Try again.',
  'adminStripe.error.serviceUnavailable': 'The admin service is not reachable. Try again in a moment.',
} as const;

export type AdminStripeKey = keyof typeof adminStripeEn;
export type AdminStripeCopy = Readonly<Record<AdminStripeKey, string>>;

export const adminStripeFr: AdminStripeCopy = {
  'adminStripe.meta.title': 'Configuration Stripe — Administration E-Code',
  'adminStripe.meta.description':
    'Configurez les identifiants Stripe chiffrés, les IDs de prix par offre et la relance des webhooks en échec pour E-Code.',
  'adminStripe.page.title': 'Configuration Stripe',
  'adminStripe.page.description':
    'Saisissez la clé secrète Stripe active et le secret de signature des webhooks, qui sont chiffrés et accessibles uniquement en écriture, puis configurez les IDs de prix de chaque offre. La facturation consulte d’abord ces valeurs et se replie sur l’environnement du service API ; laisser un secret vide conserve donc sa valeur actuelle.',
  'adminStripe.section.secrets.title': 'Secrets',
  'adminStripe.status.secretKeySet': 'Clé secrète configurée',
  'adminStripe.status.secretKeyDatabaseMissing': 'Aucune clé secrète en base de données',
  'adminStripe.status.webhookSecretSet': 'Secret de webhook configuré',
  'adminStripe.status.webhookSecretDatabaseMissing': 'Aucun secret de webhook en base de données',
  'adminStripe.status.live': 'Stripe opérationnel',
  'adminStripe.status.notConfigured': 'Stripe non configuré',
  'adminStripe.environment.present': 'disponible',
  'adminStripe.environment.absent': 'indisponible',
  'adminStripe.environment.summary':
    'Repli vers l’environnement — clé secrète : {secretKeyStatus} ; secret de webhook : {webhookSecretStatus}. Une valeur enregistrée ici remplace son repli vers l’environnement.',
  'adminStripe.field.secretKey': 'Clé secrète (sk_live_…)',
  'adminStripe.field.secretKeyKeep': 'Clé secrète (laissez vide pour conserver la valeur actuelle)',
  'adminStripe.field.secretKeyPlaceholder': 'sk_live_…',
  'adminStripe.field.webhookSecret': 'Secret de signature du webhook (whsec_…)',
  'adminStripe.field.webhookSecretKeep':
    'Secret de signature du webhook (laissez vide pour conserver la valeur actuelle)',
  'adminStripe.field.webhookSecretPlaceholder': 'whsec_…',
  'adminStripe.field.secretKeepPlaceholder': '•••••••• (inchangé)',
  'adminStripe.section.prices.title': 'IDs de prix des offres',
  'adminStripe.section.prices.empty': 'Aucune offre de facturation n’est disponible.',
  'adminStripe.field.productId': 'ID du produit',
  'adminStripe.field.legacyPriceId': 'ID du prix (ancien format ou repli mensuel)',
  'adminStripe.field.monthlyPriceId': 'ID du prix mensuel',
  'adminStripe.field.annualPriceId': 'ID du prix annuel',
  'adminStripe.field.productIdPlaceholder': 'prod_…',
  'adminStripe.field.priceIdPlaceholder': 'price_…',
  'adminStripe.field.password': 'Confirmez avec votre mot de passe',
  'adminStripe.action.save': 'Enregistrer la configuration Stripe',
  'adminStripe.action.saving': 'Enregistrement de la configuration Stripe…',
  'adminStripe.section.webhooks.title': 'Webhooks en échec',
  'adminStripe.webhooks.status.healthy': 'Toutes les livraisons ont été traitées',
  'adminStripe.webhooks.status.unresolved_one': '{count} livraison non résolue',
  'adminStripe.webhooks.status.unresolved_other': '{count} livraisons non résolues',
  'adminStripe.webhooks.description':
    'Événements Stripe dont le traitement a échoué après la livraison. La relance fait repasser l’événement enregistré par le même traitement de webhook ; une relance réussie marque la livraison comme résolue.',
  'adminStripe.webhooks.empty': 'Aucun webhook en échec.',
  'adminStripe.webhooks.table.event': 'Événement',
  'adminStripe.webhooks.table.type': 'Type',
  'adminStripe.webhooks.table.attempts': 'Tentatives',
  'adminStripe.webhooks.table.lastError': 'Dernière erreur',
  'adminStripe.webhooks.table.failedAt': 'Échec le',
  'adminStripe.webhooks.table.actions': 'Actions',
  'adminStripe.webhooks.attempts_one': '{count} tentative',
  'adminStripe.webhooks.attempts_other': '{count} tentatives',
  'adminStripe.webhooks.failure.masked':
    'Le traitement a échoué. Utilisez l’ID d’événement Stripe pour retrouver cette livraison dans les journaux serveur.',
  'adminStripe.webhooks.dateUnavailable': 'Date indisponible',
  'adminStripe.action.replay': 'Relancer',
  'adminStripe.action.replaying': 'Relance…',
  'adminStripe.action.replayAll': 'Relancer toutes les livraisons en échec',
  'adminStripe.action.replayingAll': 'Relance de toutes les livraisons en échec…',
  'adminStripe.success.configurationSaved': 'Configuration Stripe enregistrée.',
  'adminStripe.success.webhookReplayed': 'Webhook {eventId} relancé avec succès.',
  'adminStripe.success.noFailedWebhooks': 'Aucun webhook en échec à relancer.',
  'adminStripe.success.webhooksReplayed_one': '{count} webhook relancé avec succès.',
  'adminStripe.success.webhooksReplayed_other': '{count} webhooks relancés avec succès.',
  'adminStripe.error.eventIdRequired': 'Sélectionnez un événement de webhook à relancer.',
  'adminStripe.error.passwordRequired': 'Saisissez votre mot de passe pour confirmer cette modification.',
  'adminStripe.error.incorrectPassword':
    'Mot de passe incorrect. Saisissez-le de nouveau pour confirmer cette modification.',
  'adminStripe.error.reauthExpired':
    'La réauthentification a expiré. Saisissez votre mot de passe, puis renvoyez le formulaire.',
  'adminStripe.error.platformAdminRequired': 'Cette action nécessite un compte administrateur de la plateforme.',
  'adminStripe.error.requestRejected': 'La requête a été refusée. Vérifiez vos autorisations, puis réessayez.',
  'adminStripe.error.invalidConfiguration':
    'La configuration Stripe a été refusée. Vérifiez les valeurs, puis réessayez.',
  'adminStripe.error.webhookFailureNotFound':
    'Ce webhook en échec n’est plus disponible. Rechargez la page pour afficher les livraisons actuelles.',
  'adminStripe.error.conflict':
    'La configuration Stripe a changé pendant la requête. Rechargez la page, puis réessayez.',
  'adminStripe.error.rateLimited': 'Trop de requêtes ont été envoyées. Patientez un instant, puis réessayez.',
  'adminStripe.error.replayFailed':
    'Le webhook {eventId} a de nouveau échoué. Utilisez son ID d’événement Stripe pour consulter les journaux serveur avant de réessayer.',
  'adminStripe.error.partialReplay.one_one':
    '{replayed} webhook relancé avec succès ; {failed} a de nouveau échoué. Consultez les journaux serveur avant de réessayer.',
  'adminStripe.error.partialReplay.one_other':
    '{replayed} webhook relancé avec succès ; {failed} ont de nouveau échoué. Consultez les journaux serveur avant de réessayer.',
  'adminStripe.error.partialReplay.other_one':
    '{replayed} webhooks relancés avec succès ; {failed} a de nouveau échoué. Consultez les journaux serveur avant de réessayer.',
  'adminStripe.error.partialReplay.other_other':
    '{replayed} webhooks relancés avec succès ; {failed} ont de nouveau échoué. Consultez les journaux serveur avant de réessayer.',
  'adminStripe.error.saveFailed': 'Impossible d’enregistrer la configuration Stripe. Réessayez.',
  'adminStripe.error.replayUnavailable': 'Impossible de relancer le webhook. Réessayez.',
  'adminStripe.error.serviceUnavailable': 'Le service d’administration est inaccessible. Réessayez dans un instant.',
};

export const ADMIN_STRIPE_STATUS_CODES = [
  'configurationSaved',
  'webhookReplayed',
  'noFailedWebhooks',
  'webhooksReplayed',
] as const;
export type AdminStripeStatusCode = (typeof ADMIN_STRIPE_STATUS_CODES)[number];

export const ADMIN_STRIPE_ERROR_CODES = [
  'eventIdRequired',
  'passwordRequired',
  'incorrectPassword',
  'reauthExpired',
  'platformAdminRequired',
  'requestRejected',
  'invalidConfiguration',
  'webhookFailureNotFound',
  'conflict',
  'rateLimited',
  'replayFailed',
  'partialReplay',
  'saveFailed',
  'replayUnavailable',
  'serviceUnavailable',
] as const;
export type AdminStripeErrorCode = (typeof ADMIN_STRIPE_ERROR_CODES)[number];

export type AdminStripeMessageData = Readonly<{
  statusCode?: AdminStripeStatusCode;
  errorCode?: AdminStripeErrorCode;
  eventId?: string;
  replayed?: number;
  failed?: number;
}>;

export function resolveAdminStripeLanguage(language?: string | null): AdminStripeLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

function supportedLanguage(language?: string | null): SupportedLanguage {
  return resolveAdminStripeLanguage(language);
}

function locale(language?: string | null): string {
  return resolveAdminStripeLanguage(language) === 'fr' ? 'fr-FR' : 'en-GB';
}

export function getAdminStripeCopy(language?: string | null): AdminStripeCopy {
  return resolveAdminStripeLanguage(language) === 'fr' ? adminStripeFr : adminStripeEn;
}

export function formatAdminStripeCopy(
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

export function formatAdminStripeNumber(value: number | bigint, language?: string | null): string {
  return formatUserAreaNumber(value, undefined, supportedLanguage(language));
}

export function formatAdminStripeCurrency(value: number | bigint, currency: string, language?: string | null): string {
  const normalizedCurrency = /^[A-Za-z]{3}$/u.test(currency) ? currency.toUpperCase() : currency;

  try {
    return formatUserAreaNumber(
      value,
      { style: 'currency', currency: normalizedCurrency },
      supportedLanguage(language),
    );
  } catch {
    return `${formatAdminStripeNumber(value, language)} ${currency}`.trim();
  }
}

export function formatAdminStripeDateTime(value: Date | string | number, language?: string | null): string {
  return (
    formatUserAreaDateTime(
      value,
      {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: USER_AREA_TIME_ZONE,
      },
      supportedLanguage(language),
    ) ?? getAdminStripeCopy(language)['adminStripe.webhooks.dateUnavailable']
  );
}

export function formatAdminStripeWebhookCount(count: number, language?: string | null): string {
  const copy = getAdminStripeCopy(language);
  const suffix = pluralSuffix(count, language);

  return formatAdminStripeCopy(copy[`adminStripe.webhooks.status.unresolved_${suffix}`], {
    count: formatAdminStripeNumber(count, language),
  });
}

export function formatAdminStripeAttemptCount(count: number, language?: string | null): string {
  const copy = getAdminStripeCopy(language);
  const suffix = pluralSuffix(count, language);

  return formatAdminStripeCopy(copy[`adminStripe.webhooks.attempts_${suffix}`], {
    count: formatAdminStripeNumber(count, language),
  });
}

export function formatAdminStripeStatus(data: AdminStripeMessageData, language?: string | null): string | undefined {
  if (!data.statusCode) {
    return undefined;
  }

  const copy = getAdminStripeCopy(language);

  if (data.statusCode === 'webhookReplayed') {
    return formatAdminStripeCopy(copy['adminStripe.success.webhookReplayed'], {
      eventId: data.eventId ?? '',
    });
  }

  if (data.statusCode === 'webhooksReplayed') {
    const replayed = data.replayed ?? 0;
    const suffix = pluralSuffix(replayed, language);

    return formatAdminStripeCopy(copy[`adminStripe.success.webhooksReplayed_${suffix}`], {
      count: formatAdminStripeNumber(replayed, language),
    });
  }

  const key =
    data.statusCode === 'configurationSaved'
      ? 'adminStripe.success.configurationSaved'
      : 'adminStripe.success.noFailedWebhooks';

  return copy[key];
}

export function formatAdminStripeError(data: AdminStripeMessageData, language?: string | null): string | undefined {
  if (!data.errorCode) {
    return undefined;
  }

  const copy = getAdminStripeCopy(language);

  if (data.errorCode === 'replayFailed') {
    return formatAdminStripeCopy(copy['adminStripe.error.replayFailed'], {
      eventId: data.eventId ?? '',
    });
  }

  if (data.errorCode === 'partialReplay') {
    const replayed = data.replayed ?? 0;
    const failed = data.failed ?? 0;
    const replayedSuffix = pluralSuffix(replayed, language);
    const failedSuffix = pluralSuffix(failed, language);

    return formatAdminStripeCopy(copy[`adminStripe.error.partialReplay.${replayedSuffix}_${failedSuffix}`], {
      replayed: formatAdminStripeNumber(replayed, language),
      failed: formatAdminStripeNumber(failed, language),
    });
  }

  return copy[`adminStripe.error.${data.errorCode}`];
}

export async function resolveAdminStripeErrorCode(
  error: unknown,
  phase: AdminStripeMutationPhase,
): Promise<AdminStripeErrorCode> {
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

  if (code === 'STRIPE_WEBHOOK_FAILURE_NOT_FOUND') {
    return 'webhookFailureNotFound';
  }

  if (error.status === 401) {
    return phase === 'reauth' ? 'incorrectPassword' : 'requestRejected';
  }

  if (error.status === 403) {
    return 'requestRejected';
  }

  if (error.status === 400 || error.status === 422) {
    return 'invalidConfiguration';
  }

  if (error.status === 404 && phase === 'replay') {
    return 'webhookFailureNotFound';
  }

  if (error.status === 409) {
    return 'conflict';
  }

  if (error.status === 429) {
    return 'rateLimited';
  }

  return phase === 'replay' ? 'replayUnavailable' : 'saveFailed';
}

export function adminStripeInlineStatus(error: unknown): number {
  if (error instanceof Response && error.status >= 400 && error.status < 500) {
    return error.status;
  }

  return 502;
}
