import { normalizeSupportedLanguage, type SupportedLanguage } from '~/lib/i18n/language';
import { formatUserAreaDateTime, formatUserAreaNumber } from '~/lib/i18n/user-area-locale';

export type AccountDataLanguage = 'en' | 'fr';
export type AccountDeletionStatus = 'none' | 'requested' | 'grace_period' | 'ready_to_purge' | 'purged';

type LocalizedShape<Value> = Value extends string
  ? string
  : Value extends readonly (infer Item)[]
    ? readonly LocalizedShape<Item>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: LocalizedShape<Value[Key]> }
      : Value;

export const accountDataEn = {
  layout: {
    seo: {
      title: 'Account settings — E-Code',
      description: 'Manage your E-Code account, connected accounts, data and privacy settings.',
    },
    shell: {
      title: 'Account',
      description: 'Profile, connected accounts, data and privacy settings for your account.',
    },
    tabs: {
      ariaLabel: 'Account settings',
      account: 'Account',
      connected: 'Connected accounts',
      data: 'Data & privacy',
    },
  },
  profile: {
    seo: {
      title: 'Account profile settings — E-Code',
      description: 'Update your E-Code profile name, email address and time zone.',
    },
    fields: {
      name: 'Name',
      namePlaceholder: 'Ada Lovelace',
      email: 'Email address',
      emailPlaceholder: 'ada@example.com',
    },
    actions: {
      saving: 'Saving…',
      save: 'Save changes',
    },
    feedback: {
      saved: 'Account settings saved.',
    },
    errors: {
      invalidTimezone: 'Choose a valid IANA time zone.',
      valueRequired: 'Enter at least one value to update.',
      saveFailed: 'Account settings could not be saved. Try again.',
    },
    unsaved: {
      title: 'Discard changes?',
      description: 'You have unsaved account changes. If you leave now, they will be lost.',
      confirm: 'Discard',
    },
  },
  page: {
    seo: {
      title: 'Data & privacy — E-Code',
      description: 'Export your E-Code account data or manage a secure account deletion request.',
    },
    load: {
      loading: 'Loading data and privacy settings',
      errorTitle: 'Data and privacy settings could not load',
      errorDescription:
        'Account status, exports and deletion controls are hidden because the latest request failed. No account data was changed.',
    },
    success: {
      cancellation: 'Account deletion cancelled. Your account stays active.',
    },
    status: {
      title: 'Account status',
      labels: {
        none: 'Active',
        requested: 'Deletion requested',
        grace_period: 'Pending deletion',
        ready_to_purge: 'Deletion request pending',
        purged: 'Deleted',
      },
      scheduledTitle: 'Your account deletion request is recorded.',
      requestedOn: 'Requested {date}.',
      purgeOn: 'You can cancel it until {date}.',
      daysToCancel_one: 'You have {count} day to cancel.',
      daysToCancel_other: 'You have {count} days to cancel.',
      readyTitle: 'Your deletion request is pending.',
      readyDescription:
        'The cancellation period has ended. Permanent deletion is not automatic yet: your request is recorded and visible to the E-Code team.',
      purgedTitle: 'Your account has been deleted.',
      purgedDescription: 'The account deletion process has completed.',
      cancelling: 'Cancelling…',
      cancelRequest: 'Cancel deletion request',
      activeDescription: 'Your account is active. You can request deletion below.',
    },
    deletion: {
      title: 'What gets deleted',
      description_one:
        'Permanent deletion is not automatic yet. This is what it covers, and what is retained where the law requires it.',
      description_other:
        'Permanent deletion is not automatic yet. This is what it covers, and what is retained where the law requires it.',
      permanentlyRemoved: 'Permanently removed',
      retained: 'Retained (legal/financial)',
      scopeItems: {
        projectsWorkspaces: 'Projects and workspaces',
        templates: 'Templates',
        chatsAiHistory: 'Chats and AI history',
        profilePersonalInformation: 'Profile and personal information',
        connectedAccounts: 'Connected accounts',
        invoicesPaymentRecords: 'Invoices and payment records (legal/financial retention)',
        securityAuditLogs: 'Security audit logs (limited window)',
        otherDeleted: 'Other account data',
        otherRetained: 'Other legally required records',
      },
    },
    export: {
      title: 'Download my data',
      description:
        'Export a copy of your personal data as a JSON file. The export is generated server-side over your session — no secrets, tokens or passwords are ever included.',
      included: 'Included',
      excluded: 'Never included',
      download: 'Download my data (JSON)',
      filenamePrefix: 'ecode-data-export',
      includes: [
        'Profile and account preferences',
        'Organizations and your membership roles',
        'Projects (names and metadata)',
        'API keys (names and prefixes only)',
        'Connected accounts (provider and status)',
        'Recent account activity',
      ],
      excludes: ['Passwords and password hashes', 'API key secrets', 'OAuth / connection access tokens'],
    },
    danger: {
      title: 'Delete account',
      description_one:
        'This records a request to delete your account. You can cancel it for {count} days by signing back in and returning to this page. Permanent deletion is not automatic yet: the request is visible to the E-Code team.',
      description_other:
        'This records a request to delete your account. You can cancel it for {count} days by signing back in and returning to this page. Permanent deletion is not automatic yet: the request is visible to the E-Code team.',
      open: 'Delete account…',
    },
    dialog: {
      title: 'Delete your account?',
      descriptionWithDate_one:
        'Your deletion request will be recorded. You can cancel it from this page for {count} days, until {date}. Permanent deletion is not automatic yet.',
      descriptionWithDate_other:
        'Your deletion request will be recorded. You can cancel it from this page for {count} days, until {date}. Permanent deletion is not automatic yet.',
      descriptionWithoutDate_one:
        'Your deletion request will be recorded. You can cancel it from this page for {count} days. Permanent deletion is not automatic yet.',
      descriptionWithoutDate_other:
        'Your deletion request will be recorded. You can cancel it from this page for {count} days. Permanent deletion is not automatic yet.',
      confirmPrefix: 'Type',
      confirmSuffix: 'to confirm',
      cancel: 'Cancel',
      requesting: 'Requesting…',
      requestDeletion: 'Request account deletion',
    },
    errors: {
      confirmationMismatch: 'Type your account email exactly to confirm deletion.',
      unknownAction: 'This account data action is not supported.',
      requestRejected: 'The request was rejected. Check your permissions and try again.',
      cannotCancel: 'This deletion request can no longer be cancelled. Refresh the page to see its current status.',
      rateLimited: 'Too many requests. Wait a moment and try again.',
      requestFailed: 'Your deletion request could not be updated. Try again.',
    },
  },
} as const;

export const accountDataFr = {
  layout: {
    seo: {
      title: 'Paramètres du compte — E-Code',
      description:
        'Gérez votre compte E-Code, les comptes connectés, vos données et vos paramètres de confidentialité.',
    },
    shell: {
      title: 'Compte',
      description: 'Profil, comptes connectés, données et confidentialité de votre compte.',
    },
    tabs: {
      ariaLabel: 'Paramètres du compte',
      account: 'Compte',
      connected: 'Comptes connectés',
      data: 'Données et confidentialité',
    },
  },
  profile: {
    seo: {
      title: 'Paramètres du profil — E-Code',
      description: 'Mettez à jour le nom, l’adresse e-mail et le fuseau horaire de votre profil E-Code.',
    },
    fields: {
      name: 'Nom',
      namePlaceholder: 'Ada Lovelace',
      email: 'Adresse e-mail',
      emailPlaceholder: 'ada@example.com',
    },
    actions: {
      saving: 'Enregistrement…',
      save: 'Enregistrer les modifications',
    },
    feedback: {
      saved: 'Paramètres du compte enregistrés.',
    },
    errors: {
      invalidTimezone: 'Sélectionnez un fuseau horaire IANA valide.',
      valueRequired: 'Saisissez au moins une valeur à mettre à jour.',
      saveFailed: 'Impossible d’enregistrer les paramètres du compte. Réessayez.',
    },
    unsaved: {
      title: 'Abandonner les modifications ?',
      description:
        'Le compte contient des modifications non enregistrées. Elles seront perdues si vous quittez la page.',
      confirm: 'Abandonner',
    },
  },
  page: {
    seo: {
      title: 'Données et confidentialité — E-Code',
      description:
        'Exportez les données de votre compte E-Code ou gérez une demande sécurisée de suppression du compte.',
    },
    load: {
      loading: 'Chargement des paramètres de données et de confidentialité',
      errorTitle: 'Impossible de charger les paramètres de données et de confidentialité',
      errorDescription:
        'L’état du compte, les exports et les commandes de suppression sont masqués, car la dernière requête a échoué. Aucune donnée du compte n’a été modifiée.',
    },
    success: {
      cancellation: 'Demande de suppression annulée. Votre compte reste actif.',
    },
    status: {
      title: 'État du compte',
      labels: {
        none: 'Actif',
        requested: 'Suppression demandée',
        grace_period: 'Suppression en attente',
        ready_to_purge: 'Demande en attente',
        purged: 'Supprimé',
      },
      scheduledTitle: 'Votre demande de suppression du compte est enregistrée.',
      requestedOn: 'Demande effectuée le {date}.',
      purgeOn: 'Vous pouvez l’annuler jusqu’au {date}.',
      daysToCancel_one: 'Vous avez {count} jour pour annuler.',
      daysToCancel_other: 'Vous avez {count} jours pour annuler.',
      readyTitle: 'Votre demande de suppression est en attente.',
      readyDescription:
        'Le délai d’annulation est terminé. La suppression définitive n’est pas encore automatique : votre demande est enregistrée et visible par l’équipe E-Code.',
      purgedTitle: 'Votre compte a été supprimé.',
      purgedDescription: 'La procédure de suppression du compte est terminée.',
      cancelling: 'Annulation…',
      cancelRequest: 'Annuler la demande de suppression',
      activeDescription: 'Votre compte est actif. Vous pouvez demander sa suppression ci-dessous.',
    },
    deletion: {
      title: 'Données supprimées',
      description_one:
        'La suppression définitive n’est pas encore automatique. Voici ce qu’elle couvre, et ce qui est conservé lorsque la loi l’exige.',
      description_other:
        'La suppression définitive n’est pas encore automatique. Voici ce qu’elle couvre, et ce qui est conservé lorsque la loi l’exige.',
      permanentlyRemoved: 'Supprimées définitivement',
      retained: 'Conservées (obligations légales et financières)',
      scopeItems: {
        projectsWorkspaces: 'Projets et espaces de travail',
        templates: 'Modèles',
        chatsAiHistory: 'Conversations et historique de l’IA',
        profilePersonalInformation: 'Profil et informations personnelles',
        connectedAccounts: 'Comptes connectés',
        invoicesPaymentRecords: 'Factures et données de paiement (conservation légale et financière)',
        securityAuditLogs: 'Journaux d’audit de sécurité (durée limitée)',
        otherDeleted: 'Autres données du compte',
        otherRetained: 'Autres données soumises à une obligation légale de conservation',
      },
    },
    export: {
      title: 'Télécharger mes données',
      description:
        'Exportez une copie de vos données personnelles au format JSON. L’export est généré côté serveur à partir de votre session : aucun secret, jeton ou mot de passe n’est inclus.',
      included: 'Inclus',
      excluded: 'Jamais inclus',
      download: 'Télécharger mes données (JSON)',
      filenamePrefix: 'ecode-export-donnees',
      includes: [
        'Profil et préférences du compte',
        'Organisations et rôles associés à votre adhésion',
        'Projets (noms et métadonnées)',
        'Clés API (noms et préfixes uniquement)',
        'Comptes connectés (fournisseur et état)',
        'Activité récente du compte',
      ],
      excludes: [
        'Mots de passe et empreintes de mots de passe',
        'Secrets des clés API',
        'Jetons d’accès OAuth et de connexion',
      ],
    },
    danger: {
      title: 'Supprimer le compte',
      description_one:
        'Cette action enregistre une demande de suppression de votre compte. Vous pouvez l’annuler pendant {count} jour en vous reconnectant et en revenant sur cette page. La suppression définitive n’est pas encore automatique : la demande est visible par l’équipe E-Code.',
      description_other:
        'Cette action enregistre une demande de suppression de votre compte. Vous pouvez l’annuler pendant {count} jours en vous reconnectant et en revenant sur cette page. La suppression définitive n’est pas encore automatique : la demande est visible par l’équipe E-Code.',
      open: 'Supprimer le compte…',
    },
    dialog: {
      title: 'Supprimer votre compte ?',
      descriptionWithDate_one:
        'Votre demande de suppression sera enregistrée. Vous pourrez l’annuler depuis cette page pendant {count} jour, jusqu’au {date}. La suppression définitive n’est pas encore automatique.',
      descriptionWithDate_other:
        'Votre demande de suppression sera enregistrée. Vous pourrez l’annuler depuis cette page pendant {count} jours, jusqu’au {date}. La suppression définitive n’est pas encore automatique.',
      descriptionWithoutDate_one:
        'Votre demande de suppression sera enregistrée. Vous pourrez l’annuler depuis cette page pendant {count} jour. La suppression définitive n’est pas encore automatique.',
      descriptionWithoutDate_other:
        'Votre demande de suppression sera enregistrée. Vous pourrez l’annuler depuis cette page pendant {count} jours. La suppression définitive n’est pas encore automatique.',
      confirmPrefix: 'Saisissez',
      confirmSuffix: 'pour confirmer',
      cancel: 'Annuler',
      requesting: 'Envoi de la demande…',
      requestDeletion: 'Demander la suppression du compte',
    },
    errors: {
      confirmationMismatch: 'Saisissez exactement l’adresse e-mail de votre compte pour confirmer sa suppression.',
      unknownAction: 'Cette action sur les données du compte n’est pas prise en charge.',
      requestRejected: 'La requête a été refusée. Vérifiez vos autorisations, puis réessayez.',
      cannotCancel:
        'Cette demande de suppression ne peut plus être annulée. Actualisez la page pour consulter son état actuel.',
      rateLimited: 'Trop de requêtes ont été envoyées. Patientez un instant, puis réessayez.',
      requestFailed: 'Impossible de mettre à jour votre demande de suppression. Réessayez.',
    },
  },
} as const satisfies LocalizedShape<typeof accountDataEn>;

export type AccountSettingsLayoutCopy = LocalizedShape<typeof accountDataEn.layout>;
export type AccountProfileCopy = LocalizedShape<typeof accountDataEn.profile>;
export type AccountDataPageCopy = LocalizedShape<typeof accountDataEn.page>;
export type AccountDataActionIntent = 'request' | 'cancel' | 'unknown';

export const ACCOUNT_DATA_ACTION_ERROR_CODES = [
  'confirmationMismatch',
  'unknownAction',
  'requestRejected',
  'cannotCancel',
  'rateLimited',
  'requestFailed',
] as const;

export type AccountDataActionErrorCode = (typeof ACCOUNT_DATA_ACTION_ERROR_CODES)[number];

const DELETION_SCOPE_COPY_KEYS = {
  'Projects and workspaces': 'projectsWorkspaces',
  Templates: 'templates',
  'Chats and AI history': 'chatsAiHistory',
  'Profile and personal information': 'profilePersonalInformation',
  'Connected accounts': 'connectedAccounts',
  'Invoices and payment records (legal/financial retention)': 'invoicesPaymentRecords',
  'Security audit logs (limited window)': 'securityAuditLogs',
} as const satisfies Record<string, keyof AccountDataPageCopy['deletion']['scopeItems']>;

export function resolveAccountDataLanguage(language?: string | null): AccountDataLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

export function getAccountSettingsLayoutCopy(language?: string | null): AccountSettingsLayoutCopy {
  return resolveAccountDataLanguage(language) === 'fr' ? accountDataFr.layout : accountDataEn.layout;
}

export function getAccountProfileCopy(language?: string | null): AccountProfileCopy {
  return resolveAccountDataLanguage(language) === 'fr' ? accountDataFr.profile : accountDataEn.profile;
}

export function getAccountDataPageCopy(language?: string | null): AccountDataPageCopy {
  return resolveAccountDataLanguage(language) === 'fr' ? accountDataFr.page : accountDataEn.page;
}

export function interpolateAccountDataCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];
    return value === undefined ? token : String(value);
  });
}

function supportedLanguage(language?: string | null): SupportedLanguage {
  return resolveAccountDataLanguage(language);
}

export function formatAccountDataNumber(value: number | bigint, language?: string | null): string {
  return formatUserAreaNumber(value, undefined, supportedLanguage(language));
}

export function formatAccountDataDate(value: Date | string | number, language?: string | null): string | null {
  return formatUserAreaDateTime(
    value,
    { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
    supportedLanguage(language),
  );
}

export function formatAccountDataPlural(
  language: string | null | undefined,
  count: number,
  forms: Readonly<{ one: string; other: string }>,
  values: Readonly<Record<string, string | number | bigint>> = {},
): string {
  const locale = resolveAccountDataLanguage(language) === 'fr' ? 'fr-FR' : 'en-GB';
  const template = new Intl.PluralRules(locale).select(count) === 'one' ? forms.one : forms.other;

  return interpolateAccountDataCopy(template, {
    ...values,
    count: formatAccountDataNumber(count, language),
  });
}

export function localizeDeletionScopeItem(
  value: string,
  kind: 'deleted' | 'retained',
  language?: string | null,
): string {
  const copy = getAccountDataPageCopy(language).deletion.scopeItems;
  const key = DELETION_SCOPE_COPY_KEYS[value as keyof typeof DELETION_SCOPE_COPY_KEYS];

  if (key) {
    return copy[key];
  }

  return resolveAccountDataLanguage(language) === 'fr'
    ? copy[kind === 'deleted' ? 'otherDeleted' : 'otherRetained']
    : value;
}

export function resolveAccountDataActionErrorCode(
  status: number,
  intent: AccountDataActionIntent,
): AccountDataActionErrorCode {
  if (status === 401 || status === 403) {
    return 'requestRejected';
  }

  if (status === 409 && intent === 'cancel') {
    return 'cannotCancel';
  }

  if (status === 429) {
    return 'rateLimited';
  }

  return 'requestFailed';
}
