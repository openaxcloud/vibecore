import { normalizeSupportedLanguage } from '~/lib/i18n/language';
import { formatUserAreaNumber } from '~/lib/i18n/user-area-locale';

export type RecoveryCodesLanguage = 'en' | 'fr';

export const recoveryCodesEn = {
  'recoveryCodes.meta.title': 'Recovery codes — E-Code',
  'recoveryCodes.meta.description': 'Review and securely rotate the one-time recovery codes for your E-Code account.',
  'recoveryCodes.page.title': 'Recovery codes',
  'recoveryCodes.page.description': 'Manage one-time account recovery codes for MFA fallback.',
  'recoveryCodes.status.remaining_one': '{count} recovery code remaining',
  'recoveryCodes.status.remaining_other': '{count} recovery codes remaining',
  'recoveryCodes.status.total': '{remaining} / {total}',
  'recoveryCodes.status.none': 'None left — generate a new set',
  'recoveryCodes.status.low': 'Running low',
  'recoveryCodes.status.loading': 'Loading recovery-code status',
  'recoveryCodes.status.errorTitle': 'Recovery-code status could not load',
  'recoveryCodes.status.errorDescription':
    'No codes were changed. You can still confirm your password and generate a new set below.',
  'recoveryCodes.status.retry': 'Reload status',
  'recoveryCodes.explanation.title': 'One-time MFA fallback',
  'recoveryCodes.explanation.what':
    'Recovery codes are one-time backup codes that let you sign in if you lose access to your authenticator app.',
  'recoveryCodes.explanation.current_known':
    'You currently have {remaining} of {total} unused codes. Generating a new set permanently invalidates every previous code.',
  'recoveryCodes.explanation.current_unknown':
    'The number of unused codes is unavailable. Generating a new set permanently invalidates every previous code.',
  'recoveryCodes.explanation.storage':
    'Each code works once and is shown only when generated. Store the new set in a password manager or print it and keep it locked away.',
  'recoveryCodes.form.title': 'Generate a new set',
  'recoveryCodes.form.description': 'Confirm your current password before replacing every existing recovery code.',
  'recoveryCodes.form.password': 'Current password',
  'recoveryCodes.form.passwordPlaceholder': 'Enter your current password',
  'recoveryCodes.form.submit': 'Generate recovery codes',
  'recoveryCodes.form.busy': 'Generating recovery codes…',
  'recoveryCodes.dialog.title': 'Generate new recovery codes?',
  'recoveryCodes.dialog.description':
    'This permanently invalidates all existing recovery codes. Keep this dialog open only if you are ready to save the new set.',
  'recoveryCodes.dialog.confirm': 'Generate codes',
  'recoveryCodes.dialog.cancel': 'Cancel',
  'recoveryCodes.result.title': 'Save these recovery codes now',
  'recoveryCodes.result.description':
    'They will not be shown again. Each code can be used once and must remain secret.',
  'recoveryCodes.result.copy': 'Copy all codes',
  'recoveryCodes.result.copied': 'Codes copied',
  'recoveryCodes.status.rotated': 'Recovery codes were regenerated. Save them now.',
  'recoveryCodes.error.passwordRequired': 'Enter your current password to generate new recovery codes.',
  'recoveryCodes.error.incorrectPassword': 'The password is incorrect. Check it and try again.',
  'recoveryCodes.error.reauthRequired': 'Confirm your password again, then generate a new set.',
  'recoveryCodes.error.forbidden': 'You do not have permission to rotate these recovery codes.',
  'recoveryCodes.error.rateLimited': 'Too many attempts were made. Wait a moment and try again.',
  'recoveryCodes.error.rejected': 'The recovery-code request was rejected. Check your password and try again.',
  'recoveryCodes.error.unavailable': 'Recovery codes are temporarily unavailable. Please try again in a moment.',
} as const;

export type RecoveryCodesKey = keyof typeof recoveryCodesEn;
export type RecoveryCodesCopy = Readonly<Record<RecoveryCodesKey, string>>;

export const recoveryCodesFr: RecoveryCodesCopy = {
  'recoveryCodes.meta.title': 'Codes de récupération — E-Code',
  'recoveryCodes.meta.description':
    'Consultez et renouvelez en toute sécurité les codes de récupération à usage unique de votre compte E-Code.',
  'recoveryCodes.page.title': 'Codes de récupération',
  'recoveryCodes.page.description':
    'Gérez les codes de récupération à usage unique utilisés comme solution de secours pour l’authentification multifacteur.',
  'recoveryCodes.status.remaining_one': '{count} code de récupération restant',
  'recoveryCodes.status.remaining_other': '{count} codes de récupération restants',
  'recoveryCodes.status.total': '{remaining} / {total}',
  'recoveryCodes.status.none': 'Aucun code restant — générez un nouveau jeu',
  'recoveryCodes.status.low': 'Bientôt épuisés',
  'recoveryCodes.status.loading': 'Chargement de l’état des codes de récupération',
  'recoveryCodes.status.errorTitle': 'Impossible de charger l’état des codes de récupération',
  'recoveryCodes.status.errorDescription':
    'Aucun code n’a été modifié. Vous pouvez tout de même confirmer votre mot de passe et générer un nouveau jeu ci-dessous.',
  'recoveryCodes.status.retry': 'Recharger l’état',
  'recoveryCodes.explanation.title': 'Solution de secours à usage unique pour l’authentification multifacteur',
  'recoveryCodes.explanation.what':
    'Les codes de récupération sont des codes de secours à usage unique qui vous permettent de vous connecter si vous perdez l’accès à votre application d’authentification.',
  'recoveryCodes.explanation.current_known':
    'Vous disposez actuellement de {remaining} codes inutilisés sur {total}. La génération d’un nouveau jeu invalide définitivement tous les codes précédents.',
  'recoveryCodes.explanation.current_unknown':
    'Le nombre de codes inutilisés est indisponible. La génération d’un nouveau jeu invalide définitivement tous les codes précédents.',
  'recoveryCodes.explanation.storage':
    'Chaque code ne fonctionne qu’une fois et n’est affiché qu’au moment de sa génération. Enregistrez le nouveau jeu dans un gestionnaire de mots de passe ou imprimez-le et conservez-le sous clé.',
  'recoveryCodes.form.title': 'Générer un nouveau jeu',
  'recoveryCodes.form.description':
    'Confirmez votre mot de passe actuel avant de remplacer tous les codes de récupération existants.',
  'recoveryCodes.form.password': 'Mot de passe actuel',
  'recoveryCodes.form.passwordPlaceholder': 'Saisissez votre mot de passe actuel',
  'recoveryCodes.form.submit': 'Générer les codes de récupération',
  'recoveryCodes.form.busy': 'Génération des codes de récupération…',
  'recoveryCodes.dialog.title': 'Générer de nouveaux codes de récupération ?',
  'recoveryCodes.dialog.description':
    'Cette action invalide définitivement tous les codes de récupération existants. Ne poursuivez que si vous êtes prêt à enregistrer le nouveau jeu.',
  'recoveryCodes.dialog.confirm': 'Générer les codes',
  'recoveryCodes.dialog.cancel': 'Annuler',
  'recoveryCodes.result.title': 'Enregistrez ces codes de récupération maintenant',
  'recoveryCodes.result.description':
    'Ils ne seront plus affichés. Chaque code ne peut être utilisé qu’une fois et doit rester secret.',
  'recoveryCodes.result.copy': 'Copier tous les codes',
  'recoveryCodes.result.copied': 'Codes copiés',
  'recoveryCodes.status.rotated': 'Les codes de récupération ont été renouvelés. Enregistrez-les maintenant.',
  'recoveryCodes.error.passwordRequired':
    'Saisissez votre mot de passe actuel pour générer de nouveaux codes de récupération.',
  'recoveryCodes.error.incorrectPassword': 'Le mot de passe est incorrect. Vérifiez-le, puis réessayez.',
  'recoveryCodes.error.reauthRequired': 'Confirmez de nouveau votre mot de passe, puis générez un nouveau jeu.',
  'recoveryCodes.error.forbidden': 'Vous n’êtes pas autorisé à renouveler ces codes de récupération.',
  'recoveryCodes.error.rateLimited': 'Trop de tentatives ont été effectuées. Patientez un instant, puis réessayez.',
  'recoveryCodes.error.rejected':
    'La demande concernant les codes de récupération a été refusée. Vérifiez votre mot de passe, puis réessayez.',
  'recoveryCodes.error.unavailable':
    'Les codes de récupération sont temporairement indisponibles. Réessayez dans quelques instants.',
};

export type RecoveryCodesStatusCode = 'rotated';
export type RecoveryCodesErrorCode =
  | 'passwordRequired'
  | 'incorrectPassword'
  | 'reauthRequired'
  | 'forbidden'
  | 'rateLimited'
  | 'rejected'
  | 'unavailable';

export type RecoveryCodesActionData = Readonly<{
  statusCode?: RecoveryCodesStatusCode;
  errorCode?: RecoveryCodesErrorCode;
  codes?: readonly string[];
}>;

const statusKeys: Readonly<Record<RecoveryCodesStatusCode, RecoveryCodesKey>> = {
  rotated: 'recoveryCodes.status.rotated',
};

const errorKeys: Readonly<Record<RecoveryCodesErrorCode, RecoveryCodesKey>> = {
  passwordRequired: 'recoveryCodes.error.passwordRequired',
  incorrectPassword: 'recoveryCodes.error.incorrectPassword',
  reauthRequired: 'recoveryCodes.error.reauthRequired',
  forbidden: 'recoveryCodes.error.forbidden',
  rateLimited: 'recoveryCodes.error.rateLimited',
  rejected: 'recoveryCodes.error.rejected',
  unavailable: 'recoveryCodes.error.unavailable',
};

export function resolveRecoveryCodesLanguage(language?: string | null): RecoveryCodesLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

export function getRecoveryCodesCopy(language?: string | null): RecoveryCodesCopy {
  return resolveRecoveryCodesLanguage(language) === 'fr' ? recoveryCodesFr : recoveryCodesEn;
}

export function formatRecoveryCodesCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatRecoveryCodesRemaining(count: number, language?: string | null): string {
  const resolvedLanguage = resolveRecoveryCodesLanguage(language);
  const copy = getRecoveryCodesCopy(resolvedLanguage);
  const category = new Intl.PluralRules(resolvedLanguage === 'fr' ? 'fr-FR' : 'en-GB').select(count);
  const key = `recoveryCodes.status.remaining_${category === 'one' ? 'one' : 'other'}` as RecoveryCodesKey;

  return formatRecoveryCodesCopy(copy[key], {
    count: formatUserAreaNumber(count, undefined, resolvedLanguage),
  });
}

export function recoveryCodesStatusMessage(
  code: RecoveryCodesStatusCode | undefined,
  language?: string | null,
): string | undefined {
  return code ? getRecoveryCodesCopy(language)[statusKeys[code]] : undefined;
}

export function recoveryCodesErrorMessage(
  code: RecoveryCodesErrorCode | undefined,
  language?: string | null,
): string | undefined {
  return code ? getRecoveryCodesCopy(language)[errorKeys[code]] : undefined;
}

export function recoveryCodesErrorCodeForStatus(status: number, upstreamCode?: string): RecoveryCodesErrorCode {
  if (upstreamCode === 'REAUTH_REQUIRED') {
    return 'reauthRequired';
  }

  if (status === 401) {
    return 'incorrectPassword';
  }

  if (status === 403) {
    return 'forbidden';
  }

  if (status === 429) {
    return 'rateLimited';
  }

  return status >= 500 ? 'unavailable' : 'rejected';
}
