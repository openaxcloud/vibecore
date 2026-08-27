import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export type SecuritySettingsLanguage = 'en' | 'fr';

export const securitySettingsEn = {
  'securitySettings.meta.title': 'Security settings — E-Code',
  'securitySettings.meta.description':
    'Manage E-Code multi-factor authentication, passkeys, recovery codes, sessions and enterprise identity security.',
  'securitySettings.page.title': 'Security settings',
  'securitySettings.page.description':
    'Manage multi-factor authentication, passkeys, security keys, recovery codes, sessions and connected identity providers.',
  'securitySettings.mfa.loading': 'Loading two-factor authentication status',
  'securitySettings.mfa.errorTitle': 'Two-factor status could not load',
  'securitySettings.mfa.errorDescription':
    'We will not guess whether protection is enabled. Your security settings are unchanged.',
  'securitySettings.mfa.retry': 'Retry security check',
  'securitySettings.mfa.status.enabled': 'Two-factor authentication is enabled',
  'securitySettings.mfa.status.disabled': 'Two-factor authentication is off (optional)',
  'securitySettings.item.mfa.title': 'Two-factor authentication',
  'securitySettings.item.mfa.unavailable':
    'Status unavailable. Retry the security check above before making a decision.',
  'securitySettings.item.mfa.enabled': 'Your account is protected with an authenticator app.',
  'securitySettings.item.mfa.disabled': 'Add an authenticator app for an optional extra layer of protection.',
  'securitySettings.item.passkeys.title': 'Passkeys and security keys',
  'securitySettings.item.passkeys.detail':
    'Use passkeys or hardware security keys for passwordless sign-in when enabled by your organization.',
  'securitySettings.item.recovery.title': 'Recovery codes',
  'securitySettings.item.recovery.detail': 'Generate and rotate backup access codes.',
  'securitySettings.item.sessions.title': 'Active sessions',
  'securitySettings.item.sessions.detail': 'Review signed-in devices and revoke stale sessions.',
  'securitySettings.action.mfa.open': 'Open 2FA settings',
  'securitySettings.action.mfa.manage': 'Manage 2FA',
  'securitySettings.action.mfa.setup': 'Set up 2FA',
  'securitySettings.action.recovery': 'Recovery codes',
  'securitySettings.action.sessions': 'Active sessions',
  'securitySettings.enterprise.title': 'Enterprise security',
  'securitySettings.enterprise.description':
    'Manage organization security policy, verified domains, SSO (SAML/OIDC), SCIM provisioning, roles and permissions, member invitations, audit-log exports and SIEM streaming.',
  'securitySettings.enterprise.organizationSecurity': 'Organization security',
  'securitySettings.enterprise.verifiedDomains': 'Verified domains',
  'securitySettings.enterprise.sso': 'SSO settings',
  'securitySettings.enterprise.scim': 'SCIM provisioning',
  'securitySettings.enterprise.roles': 'Roles and permissions',
  'securitySettings.enterprise.invitations': 'Invitations',
  'securitySettings.enterprise.auditLogs': 'Audit logs',
  'securitySettings.enterprise.siem': 'SIEM webhooks',
} as const;

export type SecuritySettingsKey = keyof typeof securitySettingsEn;
export type SecuritySettingsCopy = Readonly<Record<SecuritySettingsKey, string>>;

export const securitySettingsFr: SecuritySettingsCopy = {
  'securitySettings.meta.title': 'Paramètres de sécurité — E-Code',
  'securitySettings.meta.description':
    'Gérez l’authentification multifacteur, les clés d’accès, les codes de récupération, les sessions et la sécurité des identités Enterprise dans E-Code.',
  'securitySettings.page.title': 'Paramètres de sécurité',
  'securitySettings.page.description':
    'Gérez l’authentification multifacteur, les clés d’accès (passkeys), les clés de sécurité, les codes de récupération, les sessions et les fournisseurs d’identité connectés.',
  'securitySettings.mfa.loading': 'Chargement du statut de l’authentification à deux facteurs',
  'securitySettings.mfa.errorTitle': 'Impossible de charger le statut de l’authentification à deux facteurs',
  'securitySettings.mfa.errorDescription':
    'Nous ne déduisons pas si la protection est activée. Vos paramètres de sécurité restent inchangés.',
  'securitySettings.mfa.retry': 'Relancer la vérification de sécurité',
  'securitySettings.mfa.status.enabled': 'L’authentification à deux facteurs est activée',
  'securitySettings.mfa.status.disabled': 'L’authentification à deux facteurs est désactivée et facultative',
  'securitySettings.item.mfa.title': 'Authentification à deux facteurs',
  'securitySettings.item.mfa.unavailable':
    'Statut indisponible. Relancez la vérification de sécurité ci-dessus avant de prendre une décision.',
  'securitySettings.item.mfa.enabled': 'Votre compte est protégé par une application d’authentification.',
  'securitySettings.item.mfa.disabled':
    'Ajoutez une application d’authentification pour renforcer facultativement la protection.',
  'securitySettings.item.passkeys.title': 'Clés d’accès (passkeys) et clés de sécurité',
  'securitySettings.item.passkeys.detail':
    'Utilisez une clé d’accès ou une clé de sécurité matérielle pour vous connecter sans mot de passe lorsque votre organisation l’autorise.',
  'securitySettings.item.recovery.title': 'Codes de récupération',
  'securitySettings.item.recovery.detail': 'Générez et renouvelez les codes d’accès de secours.',
  'securitySettings.item.sessions.title': 'Sessions actives',
  'securitySettings.item.sessions.detail': 'Consultez les appareils connectés et révoquez les sessions obsolètes.',
  'securitySettings.action.mfa.open': 'Ouvrir les paramètres 2FA',
  'securitySettings.action.mfa.manage': 'Gérer la 2FA',
  'securitySettings.action.mfa.setup': 'Configurer la 2FA',
  'securitySettings.action.recovery': 'Codes de récupération',
  'securitySettings.action.sessions': 'Sessions actives',
  'securitySettings.enterprise.title': 'Sécurité Enterprise',
  'securitySettings.enterprise.description':
    'Gérez la politique de sécurité de l’organisation, les domaines vérifiés, le SSO (SAML/OIDC), le provisionnement SCIM, les rôles et autorisations, les invitations de membres, les exports du journal d’audit et la diffusion SIEM.',
  'securitySettings.enterprise.organizationSecurity': 'Sécurité de l’organisation',
  'securitySettings.enterprise.verifiedDomains': 'Domaines vérifiés',
  'securitySettings.enterprise.sso': 'Paramètres SSO',
  'securitySettings.enterprise.scim': 'Provisionnement SCIM',
  'securitySettings.enterprise.roles': 'Rôles et autorisations',
  'securitySettings.enterprise.invitations': 'Invitations',
  'securitySettings.enterprise.auditLogs': 'Journaux d’audit',
  'securitySettings.enterprise.siem': 'Webhooks SIEM',
};

export function resolveSecuritySettingsLanguage(language?: string | null): SecuritySettingsLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

export function getSecuritySettingsCopy(language?: string | null): SecuritySettingsCopy {
  return resolveSecuritySettingsLanguage(language) === 'fr' ? securitySettingsFr : securitySettingsEn;
}
