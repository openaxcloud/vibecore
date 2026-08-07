import { normalizeSupportedLanguage, type SupportedLanguage } from '~/lib/i18n/language';
import { formatUserAreaDateTime, formatUserAreaNumber, USER_AREA_TIME_ZONE } from '~/lib/i18n/user-area-locale';

export type AdminWalletsLanguage = 'en' | 'fr';
export type AdminWalletMutationPhase = 'reauth' | 'adjust';
export type AdminWalletField = 'organizationId' | 'direction' | 'amount' | 'reason' | 'password';

export const adminWalletsEn = {
  'adminWallets.meta.title': 'Credit wallets — E-Code Admin',
  'adminWallets.meta.description':
    'Review organization credit wallets and apply password-confirmed, audited balance adjustments.',
  'adminWallets.page.title': 'Credit wallets',
  'adminWallets.page.description':
    'Review organization balances, budget caps and service-shutdown thresholds. Every credit or debit below creates an auditable ledger adjustment and updates the balance atomically.',
  'adminWallets.wallets.title': 'Organization wallets',
  'adminWallets.wallets.count_one': '{count} wallet',
  'adminWallets.wallets.count_other': '{count} wallets',
  'adminWallets.wallets.loading': 'Loading credit wallets',
  'adminWallets.wallets.errorTitle': 'Credit wallets could not load',
  'adminWallets.wallets.errorDescription':
    'No wallet was changed. Reload this panel to retrieve the latest balances. You can still enter an organization ID manually below.',
  'adminWallets.wallets.retry': 'Reload wallets',
  'adminWallets.wallets.emptyTitle': 'No credit wallets yet',
  'adminWallets.wallets.emptyDescription': 'Wallets appear here after an organization receives or uses credits.',
  'adminWallets.table.organization': 'Organization',
  'adminWallets.table.balance': 'Balance',
  'adminWallets.table.budgetCap': 'Budget cap',
  'adminWallets.table.shutdownAt': 'Shutdown at',
  'adminWallets.table.updated': 'Updated',
  'adminWallets.table.dateUnavailable': 'Date unavailable',
  'adminWallets.form.title': 'Adjust a balance',
  'adminWallets.form.description':
    'Confirm the organization, direction and USD amount. The reason is permanently recorded in the credit ledger.',
  'adminWallets.field.organization': 'Organization ID',
  'adminWallets.field.organizationPlaceholder': 'organization ID',
  'adminWallets.field.direction': 'Direction',
  'adminWallets.direction.credit': 'Credit (add funds)',
  'adminWallets.direction.debit': 'Debit (remove funds)',
  'adminWallets.field.amount': 'Amount (USD)',
  'adminWallets.field.amountPlaceholder': '10.00',
  'adminWallets.field.reason': 'Reason (recorded in the audit trail)',
  'adminWallets.field.reasonPlaceholder': 'Goodwill credit or manual correction',
  'adminWallets.field.password': 'Confirm with your password',
  'adminWallets.action.apply': 'Apply adjustment',
  'adminWallets.action.applying': 'Applying adjustment…',
  'adminWallets.success.credited': 'Credited {amount} to {organization}. New balance: {balance}.',
  'adminWallets.success.debited': 'Debited {amount} from {organization}. New balance: {balance}.',
  'adminWallets.error.organizationRequired': 'Choose an organization to adjust.',
  'adminWallets.error.organizationInvalid': 'Enter a valid organization ID.',
  'adminWallets.error.directionInvalid': 'Choose credit or debit.',
  'adminWallets.error.amountRequired': 'Enter an amount.',
  'adminWallets.error.amountInvalid': 'Enter an amount greater than zero.',
  'adminWallets.error.amountPrecision': 'Enter an amount with no more than two decimal places.',
  'adminWallets.error.amountTooLarge': 'Enter a smaller adjustment amount.',
  'adminWallets.error.reasonRequired': 'Enter a reason — it is recorded in the audit trail.',
  'adminWallets.error.reasonTooLong': 'Keep the reason to 500 characters or fewer.',
  'adminWallets.error.passwordRequired': 'Enter your password to confirm this change.',
  'adminWallets.error.incorrectPassword': 'Incorrect password. Re-enter it to confirm this change.',
  'adminWallets.error.reauthExpired': 'Re-authentication expired. Enter your password and submit again.',
  'adminWallets.error.platformAdminRequired': 'This action requires a platform administrator account.',
  'adminWallets.error.requestRejected': 'The request was rejected. Check your permissions and try again.',
  'adminWallets.error.adjustmentRejected': 'The wallet adjustment was rejected. Check the values and try again.',
  'adminWallets.error.organizationNotFound':
    'This organization or wallet is no longer available. Reload the list and try again.',
  'adminWallets.error.conflict': 'The wallet changed during this request. Reload the list and try again.',
  'adminWallets.error.rateLimited': 'Too many adjustment requests were sent. Wait a moment and try again.',
  'adminWallets.error.serviceUnavailable': 'The admin service is not reachable. Try again in a moment.',
} as const;

export type AdminWalletsKey = keyof typeof adminWalletsEn;
export type AdminWalletsCopy = Readonly<Record<AdminWalletsKey, string>>;

export const adminWalletsFr: AdminWalletsCopy = {
  'adminWallets.meta.title': 'Portefeuilles de crédits — Administration E-Code',
  'adminWallets.meta.description':
    'Consultez les portefeuilles de crédits des organisations et appliquez des ajustements audités, confirmés par mot de passe.',
  'adminWallets.page.title': 'Portefeuilles de crédits',
  'adminWallets.page.description':
    'Consultez les soldes, plafonds budgétaires et seuils d’arrêt des organisations. Chaque crédit ou débit ci-dessous crée un ajustement auditable dans le registre et met à jour le solde de façon atomique.',
  'adminWallets.wallets.title': 'Portefeuilles des organisations',
  'adminWallets.wallets.count_one': '{count} portefeuille',
  'adminWallets.wallets.count_other': '{count} portefeuilles',
  'adminWallets.wallets.loading': 'Chargement des portefeuilles de crédits',
  'adminWallets.wallets.errorTitle': 'Impossible de charger les portefeuilles de crédits',
  'adminWallets.wallets.errorDescription':
    'Aucun portefeuille n’a été modifié. Rechargez ce panneau pour obtenir les soldes les plus récents. Vous pouvez tout de même saisir manuellement l’ID d’une organisation ci-dessous.',
  'adminWallets.wallets.retry': 'Recharger les portefeuilles',
  'adminWallets.wallets.emptyTitle': 'Aucun portefeuille de crédits pour le moment',
  'adminWallets.wallets.emptyDescription':
    'Les portefeuilles apparaissent ici dès qu’une organisation reçoit ou utilise des crédits.',
  'adminWallets.table.organization': 'Organisation',
  'adminWallets.table.balance': 'Solde',
  'adminWallets.table.budgetCap': 'Plafond budgétaire',
  'adminWallets.table.shutdownAt': 'Seuil d’arrêt',
  'adminWallets.table.updated': 'Dernière modification',
  'adminWallets.table.dateUnavailable': 'Date indisponible',
  'adminWallets.form.title': 'Ajuster un solde',
  'adminWallets.form.description':
    'Confirmez l’organisation, le sens et le montant en USD. Le motif est enregistré définitivement dans le registre des crédits.',
  'adminWallets.field.organization': 'ID de l’organisation',
  'adminWallets.field.organizationPlaceholder': 'ID de l’organisation',
  'adminWallets.field.direction': 'Sens',
  'adminWallets.direction.credit': 'Créditer (ajouter des fonds)',
  'adminWallets.direction.debit': 'Débiter (retirer des fonds)',
  'adminWallets.field.amount': 'Montant (USD)',
  'adminWallets.field.amountPlaceholder': '10,00',
  'adminWallets.field.reason': 'Motif (enregistré dans le journal d’audit)',
  'adminWallets.field.reasonPlaceholder': 'Crédit commercial ou correction manuelle',
  'adminWallets.field.password': 'Confirmez avec votre mot de passe',
  'adminWallets.action.apply': 'Appliquer l’ajustement',
  'adminWallets.action.applying': 'Application de l’ajustement…',
  'adminWallets.success.credited': 'Crédit de {amount} appliqué à {organization}. Nouveau solde : {balance}.',
  'adminWallets.success.debited': 'Débit de {amount} appliqué à {organization}. Nouveau solde : {balance}.',
  'adminWallets.error.organizationRequired': 'Choisissez une organisation à ajuster.',
  'adminWallets.error.organizationInvalid': 'Saisissez un ID d’organisation valide.',
  'adminWallets.error.directionInvalid': 'Choisissez de créditer ou de débiter.',
  'adminWallets.error.amountRequired': 'Saisissez un montant.',
  'adminWallets.error.amountInvalid': 'Saisissez un montant supérieur à zéro.',
  'adminWallets.error.amountPrecision': 'Saisissez un montant comportant au maximum deux décimales.',
  'adminWallets.error.amountTooLarge': 'Saisissez un montant d’ajustement inférieur.',
  'adminWallets.error.reasonRequired': 'Saisissez un motif — il est enregistré dans le journal d’audit.',
  'adminWallets.error.reasonTooLong': 'Limitez le motif à 500 caractères.',
  'adminWallets.error.passwordRequired': 'Saisissez votre mot de passe pour confirmer cette modification.',
  'adminWallets.error.incorrectPassword':
    'Mot de passe incorrect. Saisissez-le de nouveau pour confirmer cette modification.',
  'adminWallets.error.reauthExpired':
    'La réauthentification a expiré. Saisissez votre mot de passe, puis renvoyez le formulaire.',
  'adminWallets.error.platformAdminRequired': 'Cette action nécessite un compte administrateur de la plateforme.',
  'adminWallets.error.requestRejected': 'La requête a été refusée. Vérifiez vos autorisations, puis réessayez.',
  'adminWallets.error.adjustmentRejected':
    'L’ajustement du portefeuille a été refusé. Vérifiez les valeurs, puis réessayez.',
  'adminWallets.error.organizationNotFound':
    'Cette organisation ou ce portefeuille n’est plus disponible. Rechargez la liste, puis réessayez.',
  'adminWallets.error.conflict': 'Le portefeuille a changé pendant la requête. Rechargez la liste, puis réessayez.',
  'adminWallets.error.rateLimited':
    'Trop de demandes d’ajustement ont été envoyées. Patientez un instant, puis réessayez.',
  'adminWallets.error.serviceUnavailable':
    'Le service d’administration est inaccessible. Réessayez dans quelques instants.',
};

export type AdminWalletStatusCode = 'credited' | 'debited';
export type AdminWalletErrorCode =
  | 'organizationRequired'
  | 'organizationInvalid'
  | 'directionInvalid'
  | 'amountRequired'
  | 'amountInvalid'
  | 'amountPrecision'
  | 'amountTooLarge'
  | 'reasonRequired'
  | 'reasonTooLong'
  | 'passwordRequired'
  | 'incorrectPassword'
  | 'reauthExpired'
  | 'platformAdminRequired'
  | 'requestRejected'
  | 'adjustmentRejected'
  | 'organizationNotFound'
  | 'conflict'
  | 'rateLimited'
  | 'serviceUnavailable';

export type AdminWalletActionData = Readonly<{
  statusCode?: AdminWalletStatusCode;
  errorCode?: AdminWalletErrorCode;
  field?: AdminWalletField;
  organizationId?: string;
  amountCents?: number;
  balanceCents?: number;
  currency?: string;
}>;

const errorKeys: Readonly<Record<AdminWalletErrorCode, AdminWalletsKey>> = {
  organizationRequired: 'adminWallets.error.organizationRequired',
  organizationInvalid: 'adminWallets.error.organizationInvalid',
  directionInvalid: 'adminWallets.error.directionInvalid',
  amountRequired: 'adminWallets.error.amountRequired',
  amountInvalid: 'adminWallets.error.amountInvalid',
  amountPrecision: 'adminWallets.error.amountPrecision',
  amountTooLarge: 'adminWallets.error.amountTooLarge',
  reasonRequired: 'adminWallets.error.reasonRequired',
  reasonTooLong: 'adminWallets.error.reasonTooLong',
  passwordRequired: 'adminWallets.error.passwordRequired',
  incorrectPassword: 'adminWallets.error.incorrectPassword',
  reauthExpired: 'adminWallets.error.reauthExpired',
  platformAdminRequired: 'adminWallets.error.platformAdminRequired',
  requestRejected: 'adminWallets.error.requestRejected',
  adjustmentRejected: 'adminWallets.error.adjustmentRejected',
  organizationNotFound: 'adminWallets.error.organizationNotFound',
  conflict: 'adminWallets.error.conflict',
  rateLimited: 'adminWallets.error.rateLimited',
  serviceUnavailable: 'adminWallets.error.serviceUnavailable',
};

export function resolveAdminWalletsLanguage(language?: string | null): AdminWalletsLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

function supportedLanguage(language?: string | null): SupportedLanguage {
  return resolveAdminWalletsLanguage(language);
}

function locale(language?: string | null): string {
  return resolveAdminWalletsLanguage(language) === 'fr' ? 'fr-FR' : 'en-GB';
}

export function getAdminWalletsCopy(language?: string | null): AdminWalletsCopy {
  return resolveAdminWalletsLanguage(language) === 'fr' ? adminWalletsFr : adminWalletsEn;
}

export function formatAdminWalletsCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatAdminWalletCurrency(
  cents: number | undefined,
  currency = 'USD',
  language?: string | null,
): string {
  if (cents === undefined || !Number.isFinite(cents)) {
    return '—';
  }

  const normalizedCurrency = /^[A-Za-z]{3}$/u.test(currency) ? currency.toUpperCase() : 'USD';

  try {
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
  } catch {
    return `${formatUserAreaNumber(
      cents / 100,
      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      supportedLanguage(language),
    )}\u00a0${normalizedCurrency}`;
  }
}

export function formatAdminWalletDateTime(value: string | undefined, language?: string | null): string {
  return (
    (value
      ? formatUserAreaDateTime(
          value,
          {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: USER_AREA_TIME_ZONE,
          },
          supportedLanguage(language),
        )
      : null) ?? getAdminWalletsCopy(language)['adminWallets.table.dateUnavailable']
  );
}

export function formatAdminWalletCount(count: number, language?: string | null): string {
  const copy = getAdminWalletsCopy(language);
  const suffix = new Intl.PluralRules(locale(language)).select(count) === 'one' ? 'one' : 'other';

  return formatAdminWalletsCopy(copy[`adminWallets.wallets.count_${suffix}`], {
    count: formatUserAreaNumber(count, undefined, supportedLanguage(language)),
  });
}

export function formatAdminWalletStatus(data: AdminWalletActionData, language?: string | null): string | undefined {
  if (!data.statusCode || !data.organizationId || data.amountCents === undefined || data.balanceCents === undefined) {
    return undefined;
  }

  const copy = getAdminWalletsCopy(language);

  return formatAdminWalletsCopy(copy[`adminWallets.success.${data.statusCode}`], {
    organization: data.organizationId,
    amount: formatAdminWalletCurrency(data.amountCents, data.currency, language),
    balance: formatAdminWalletCurrency(data.balanceCents, data.currency, language),
  });
}

export function formatAdminWalletError(data: AdminWalletActionData, language?: string | null): string | undefined {
  return data.errorCode ? getAdminWalletsCopy(language)[errorKeys[data.errorCode]] : undefined;
}

export async function readAdminWalletApiCode(error: unknown): Promise<string | undefined> {
  if (!(error instanceof Response)) {
    return undefined;
  }

  try {
    const payload = (await error.clone().json()) as { code?: unknown };

    return typeof payload.code === 'string' ? payload.code : undefined;
  } catch {
    return undefined;
  }
}

export async function resolveAdminWalletErrorCode(
  error: unknown,
  phase: AdminWalletMutationPhase,
): Promise<AdminWalletErrorCode> {
  if (!(error instanceof Response)) {
    return 'serviceUnavailable';
  }

  const code = await readAdminWalletApiCode(error);

  if (code === 'AUTH_INVALID_CREDENTIALS') {
    return 'incorrectPassword';
  }

  if (code === 'ADMIN_REAUTH_REQUIRED') {
    return 'reauthExpired';
  }

  if (code === 'PLATFORM_ADMIN_REQUIRED') {
    return 'platformAdminRequired';
  }

  if (code === 'WALLET_ADJUST_REASON_REQUIRED') {
    return 'reasonRequired';
  }

  if (error.status === 401) {
    return phase === 'reauth' ? 'incorrectPassword' : 'requestRejected';
  }

  if (error.status === 403) {
    return 'requestRejected';
  }

  if (error.status === 400 || error.status === 422) {
    return 'adjustmentRejected';
  }

  if (error.status === 404) {
    return 'organizationNotFound';
  }

  if (error.status === 409) {
    return 'conflict';
  }

  if (error.status === 429) {
    return 'rateLimited';
  }

  return 'serviceUnavailable';
}

export function adminWalletInlineStatus(error: unknown): number {
  if (error instanceof Response && error.status >= 400 && error.status < 500) {
    return error.status;
  }

  return 502;
}
