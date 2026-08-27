import { normalizeSupportedLanguage } from '~/lib/i18n/language';
import { formatUserAreaDateTime, USER_AREA_TIME_ZONE } from '~/lib/i18n/user-area-locale';

export type SessionSecurityLanguage = 'en' | 'fr';

export const sessionSecurityEn = {
  'sessionSecurity.meta.title': 'Session security — E-Code',
  'sessionSecurity.meta.description':
    'Review active E-Code sessions, revoke signed-in devices and manage your organization session security policy.',
  'sessionSecurity.page.title': 'Session security',
  'sessionSecurity.page.description':
    'Review signed-in devices, revoke sessions and manage your organization session duration policy.',
  'sessionSecurity.sessions.title': 'Active sessions',
  'sessionSecurity.sessions.description':
    "Devices currently signed in to your account. Revoke any you don't recognize.",
  'sessionSecurity.sessions.signOutAll': 'Sign out all other sessions',
  'sessionSecurity.sessions.signingOutAll': 'Signing out other sessions…',
  'sessionSecurity.sessions.loading': 'Loading active sessions',
  'sessionSecurity.sessions.errorTitle': 'Active sessions could not load',
  'sessionSecurity.sessions.errorDescription':
    'No session was revoked. You can still update the organization policy below.',
  'sessionSecurity.sessions.retry': 'Retry loading sessions',
  'sessionSecurity.sessions.empty': 'No active sessions found.',
  'sessionSecurity.sessions.thisDevice': 'This device',
  'sessionSecurity.sessions.ipAddress': 'IP: {address}',
  'sessionSecurity.sessions.ipUnknown': 'IP address unknown',
  'sessionSecurity.sessions.signedIn': 'Signed in {date}',
  'sessionSecurity.sessions.dateUnknown': 'date unavailable',
  'sessionSecurity.sessions.current': 'Current session',
  'sessionSecurity.sessions.revoke': 'Revoke',
  'sessionSecurity.sessions.revoking': 'Revoking…',
  'sessionSecurity.policy.title': 'Organization session policy',
  'sessionSecurity.policy.description':
    'Applies to everyone in the organization: session lifetime and the IP ranges allowed to sign in.',
  'sessionSecurity.policy.duration': 'Session duration (minutes)',
  'sessionSecurity.policy.ipAllowlist': 'Allowed IP addresses',
  'sessionSecurity.policy.ipPlaceholder': '203.0.113.10,198.51.100.0/24',
  'sessionSecurity.policy.save': 'Save policy',
  'sessionSecurity.policy.saving': 'Saving policy…',
  'sessionSecurity.dialog.revoke.title': 'Revoke this session ({device})?',
  'sessionSecurity.dialog.revoke.description': 'That device will be signed out immediately.',
  'sessionSecurity.dialog.revoke.confirm': 'Revoke session',
  'sessionSecurity.dialog.revokeAll.title': 'Sign out all other sessions?',
  'sessionSecurity.dialog.revokeAll.description':
    'Every device except this one will be signed out immediately. Your current session stays active.',
  'sessionSecurity.dialog.revokeAll.confirm': 'Sign out all other sessions',
  'sessionSecurity.device.unknown': 'Unknown device',
  'sessionSecurity.device.browser': 'Browser',
  'sessionSecurity.device.unknownOs': 'unknown operating system',
  'sessionSecurity.device.description': '{browser} on {os}',
  'sessionSecurity.status.sessionRevoked': 'Session revoked. That device has been signed out.',
  'sessionSecurity.status.otherSessionsRevoked': 'All other sessions have been signed out.',
  'sessionSecurity.status.policySaved': 'Session security policy saved.',
  'sessionSecurity.error.sessionRequired': 'Choose a session and try again.',
  'sessionSecurity.error.organizationUnavailable': 'Your organization is unavailable. Reload the page and try again.',
  'sessionSecurity.error.forbidden': 'You do not have permission to complete this security action.',
  'sessionSecurity.error.notFound':
    'The requested session or policy is no longer available. Reload the page and try again.',
  'sessionSecurity.error.conflict':
    'Session security changed while this action was running. Reload the page and try again.',
  'sessionSecurity.error.rateLimited': 'Too many security requests were sent. Wait a moment and try again.',
  'sessionSecurity.error.rejected': 'The security action was rejected. Check your entries and try again.',
  'sessionSecurity.error.unavailable': 'This security action is temporarily unavailable. Please try again in a moment.',
} as const;

export type SessionSecurityKey = keyof typeof sessionSecurityEn;
export type SessionSecurityCopy = Readonly<Record<SessionSecurityKey, string>>;

export const sessionSecurityFr: SessionSecurityCopy = {
  'sessionSecurity.meta.title': 'Sécurité des sessions — E-Code',
  'sessionSecurity.meta.description':
    'Consultez les sessions E-Code actives, révoquez les appareils connectés et gérez la politique de sécurité des sessions de votre organisation.',
  'sessionSecurity.page.title': 'Sécurité des sessions',
  'sessionSecurity.page.description':
    'Consultez les appareils connectés, révoquez des sessions et gérez leur durée pour votre organisation.',
  'sessionSecurity.sessions.title': 'Sessions actives',
  'sessionSecurity.sessions.description':
    'Appareils actuellement connectés à votre compte. Révoquez ceux que vous ne reconnaissez pas.',
  'sessionSecurity.sessions.signOutAll': 'Déconnecter toutes les autres sessions',
  'sessionSecurity.sessions.signingOutAll': 'Déconnexion des autres sessions…',
  'sessionSecurity.sessions.loading': 'Chargement des sessions actives',
  'sessionSecurity.sessions.errorTitle': 'Impossible de charger les sessions actives',
  'sessionSecurity.sessions.errorDescription':
    'Aucune session n’a été révoquée. Vous pouvez toujours modifier la politique de l’organisation ci-dessous.',
  'sessionSecurity.sessions.retry': 'Recharger les sessions',
  'sessionSecurity.sessions.empty': 'Aucune session active.',
  'sessionSecurity.sessions.thisDevice': 'Cet appareil',
  'sessionSecurity.sessions.ipAddress': 'IP : {address}',
  'sessionSecurity.sessions.ipUnknown': 'Adresse IP inconnue',
  'sessionSecurity.sessions.signedIn': 'Connexion le {date}',
  'sessionSecurity.sessions.dateUnknown': 'date indisponible',
  'sessionSecurity.sessions.current': 'Session actuelle',
  'sessionSecurity.sessions.revoke': 'Révoquer',
  'sessionSecurity.sessions.revoking': 'Révocation…',
  'sessionSecurity.policy.title': 'Politique de session de l’organisation',
  'sessionSecurity.policy.description':
    'S’applique à tous les membres de l’organisation : durée des sessions et plages d’adresses IP autorisées à se connecter.',
  'sessionSecurity.policy.duration': 'Durée de session (en minutes)',
  'sessionSecurity.policy.ipAllowlist': 'Adresses IP autorisées',
  'sessionSecurity.policy.ipPlaceholder': '203.0.113.10,198.51.100.0/24',
  'sessionSecurity.policy.save': 'Enregistrer la politique',
  'sessionSecurity.policy.saving': 'Enregistrement de la politique…',
  'sessionSecurity.dialog.revoke.title': 'Révoquer cette session ({device}) ?',
  'sessionSecurity.dialog.revoke.description': 'Cet appareil sera immédiatement déconnecté.',
  'sessionSecurity.dialog.revoke.confirm': 'Révoquer la session',
  'sessionSecurity.dialog.revokeAll.title': 'Déconnecter toutes les autres sessions ?',
  'sessionSecurity.dialog.revokeAll.description':
    'Tous les appareils sauf celui-ci seront immédiatement déconnectés. Votre session actuelle restera active.',
  'sessionSecurity.dialog.revokeAll.confirm': 'Déconnecter les autres sessions',
  'sessionSecurity.device.unknown': 'Appareil inconnu',
  'sessionSecurity.device.browser': 'Navigateur',
  'sessionSecurity.device.unknownOs': 'système d’exploitation inconnu',
  'sessionSecurity.device.description': '{browser} sur {os}',
  'sessionSecurity.status.sessionRevoked': 'Session révoquée. Cet appareil a été déconnecté.',
  'sessionSecurity.status.otherSessionsRevoked': 'Toutes les autres sessions ont été déconnectées.',
  'sessionSecurity.status.policySaved': 'Politique de sécurité des sessions enregistrée.',
  'sessionSecurity.error.sessionRequired': 'Choisissez une session, puis réessayez.',
  'sessionSecurity.error.organizationUnavailable':
    'Votre organisation est indisponible. Rechargez la page, puis réessayez.',
  'sessionSecurity.error.forbidden': 'Vous n’êtes pas autorisé à effectuer cette action de sécurité.',
  'sessionSecurity.error.notFound':
    'La session ou la politique demandée n’est plus disponible. Rechargez la page, puis réessayez.',
  'sessionSecurity.error.conflict':
    'La sécurité des sessions a changé pendant cette action. Rechargez la page, puis réessayez.',
  'sessionSecurity.error.rateLimited':
    'Trop de requêtes de sécurité ont été envoyées. Patientez un instant, puis réessayez.',
  'sessionSecurity.error.rejected':
    'L’action de sécurité a été refusée. Vérifiez les informations saisies, puis réessayez.',
  'sessionSecurity.error.unavailable':
    'Cette action de sécurité est temporairement indisponible. Réessayez dans quelques instants.',
};

export type SessionSecurityStatusCode = 'sessionRevoked' | 'otherSessionsRevoked' | 'policySaved';
export type SessionSecurityErrorCode =
  | 'sessionRequired'
  | 'organizationUnavailable'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'rateLimited'
  | 'rejected'
  | 'unavailable';

export type SessionSecurityActionData = Readonly<{
  statusCode?: SessionSecurityStatusCode;
  errorCode?: SessionSecurityErrorCode;
}>;

const statusKeys: Readonly<Record<SessionSecurityStatusCode, SessionSecurityKey>> = {
  sessionRevoked: 'sessionSecurity.status.sessionRevoked',
  otherSessionsRevoked: 'sessionSecurity.status.otherSessionsRevoked',
  policySaved: 'sessionSecurity.status.policySaved',
};

const errorKeys: Readonly<Record<SessionSecurityErrorCode, SessionSecurityKey>> = {
  sessionRequired: 'sessionSecurity.error.sessionRequired',
  organizationUnavailable: 'sessionSecurity.error.organizationUnavailable',
  forbidden: 'sessionSecurity.error.forbidden',
  notFound: 'sessionSecurity.error.notFound',
  conflict: 'sessionSecurity.error.conflict',
  rateLimited: 'sessionSecurity.error.rateLimited',
  rejected: 'sessionSecurity.error.rejected',
  unavailable: 'sessionSecurity.error.unavailable',
};

export function resolveSessionSecurityLanguage(language?: string | null): SessionSecurityLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

export function getSessionSecurityCopy(language?: string | null): SessionSecurityCopy {
  return resolveSessionSecurityLanguage(language) === 'fr' ? sessionSecurityFr : sessionSecurityEn;
}

export function formatSessionSecurityCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function sessionSecurityStatusMessage(
  code: SessionSecurityStatusCode | undefined,
  language?: string | null,
): string | undefined {
  return code ? getSessionSecurityCopy(language)[statusKeys[code]] : undefined;
}

export function sessionSecurityErrorMessage(
  code: SessionSecurityErrorCode | undefined,
  language?: string | null,
): string | undefined {
  return code ? getSessionSecurityCopy(language)[errorKeys[code]] : undefined;
}

export function sessionSecurityErrorCodeForStatus(status: number): SessionSecurityErrorCode {
  if (status === 403) {
    return 'forbidden';
  }

  if (status === 404) {
    return 'notFound';
  }

  if (status === 409) {
    return 'conflict';
  }

  if (status === 429) {
    return 'rateLimited';
  }

  return 'rejected';
}

export function describeSessionSecurityDevice(userAgent: string | undefined, language?: string | null): string {
  const copy = getSessionSecurityCopy(language);

  if (!userAgent) {
    return copy['sessionSecurity.device.unknown'];
  }

  const browser = userAgent.includes('Edg')
    ? 'Edge'
    : userAgent.includes('OPR') || userAgent.includes('Opera')
      ? 'Opera'
      : userAgent.includes('Firefox')
        ? 'Firefox'
        : userAgent.includes('Chrome')
          ? 'Chrome'
          : userAgent.includes('Safari')
            ? 'Safari'
            : copy['sessionSecurity.device.browser'];

  const os = /iPhone|iPad|iPod/u.test(userAgent)
    ? 'iOS'
    : userAgent.includes('Android')
      ? 'Android'
      : userAgent.includes('Mac OS X') || userAgent.includes('Macintosh')
        ? 'macOS'
        : userAgent.includes('Windows')
          ? 'Windows'
          : userAgent.includes('Linux')
            ? 'Linux'
            : copy['sessionSecurity.device.unknownOs'];

  return formatSessionSecurityCopy(copy['sessionSecurity.device.description'], { browser, os });
}

export function formatSessionSecurityDateTime(value: string, language?: string | null): string {
  const resolvedLanguage = resolveSessionSecurityLanguage(language);

  return (
    formatUserAreaDateTime(
      value,
      {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: USER_AREA_TIME_ZONE,
      },
      resolvedLanguage,
    ) ?? getSessionSecurityCopy(resolvedLanguage)['sessionSecurity.sessions.dateUnknown']
  );
}
