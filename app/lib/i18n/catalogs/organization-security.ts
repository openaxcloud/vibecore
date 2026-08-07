import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export const organizationSecurityEn = {
  'organizationSecurity.title': 'Organization security',
  'organizationSecurity.description':
    'Authoritative security policy for {organization}: IP allowlist, session lifetime, admin MFA, data retention and legal hold.',
  'organizationSecurity.load.loading': 'Loading organization security settings',
  'organizationSecurity.load.permissionTitle': 'Security settings are restricted',
  'organizationSecurity.load.errorTitle': 'Security settings could not load',
  'organizationSecurity.load.permissionDescription':
    "Your role cannot manage this organization's security policy. No settings can be changed from this page.",
  'organizationSecurity.load.errorDescription':
    'The editor is hidden to prevent fallback values from overwriting the current policy. No settings were changed.',
  'organizationSecurity.load.retry': 'Reload security settings',
  'organizationSecurity.errors.permissionView':
    "You don't have permission to manage this organization's security settings.",
  'organizationSecurity.errors.temporaryLoad': 'Security settings are temporarily unavailable.',
  'organizationSecurity.errors.organizationUnavailable':
    'Your organization is unavailable. Reload the page and try again.',
  'organizationSecurity.errors.invalidIp': 'Not a valid IP address or CIDR block: {entries}',
  'organizationSecurity.errors.sessionRange': 'Session duration must be between {minimum} and {maximum} minutes.',
  'organizationSecurity.errors.retentionRange': 'Data retention must be between {minimum} and {maximum} days.',
  'organizationSecurity.errors.permissionChange':
    "You don't have permission to change this organization's security settings.",
  'organizationSecurity.errors.save': 'Could not save security settings.',
  'organizationSecurity.errors.temporarySave':
    'Saving security settings is temporarily unavailable. Please try again in a moment.',
  'organizationSecurity.success.saved': 'Organization security settings saved.',
  'organizationSecurity.allowlist.title': 'IP allowlist',
  'organizationSecurity.allowlist.description':
    'Only these IP addresses or CIDR ranges may access the organization. Leave empty to allow all.',
  'organizationSecurity.allowlist.placeholder': '203.0.113.10 or 198.51.100.0/24',
  'organizationSecurity.allowlist.inputAria': 'IP address or CIDR block',
  'organizationSecurity.allowlist.add': 'Add',
  'organizationSecurity.allowlist.invalidDraft':
    'Enter a valid IP address or CIDR block, e.g. 203.0.113.10 or 198.51.100.0/24.',
  'organizationSecurity.allowlist.duplicate': 'That entry is already in the allowlist.',
  'organizationSecurity.allowlist.removeAria': 'Remove {entry}',
  'organizationSecurity.allowlist.remove': 'Remove',
  'organizationSecurity.allowlist.empty': 'No restrictions — every IP address is allowed.',
  'organizationSecurity.session.label': 'Session duration (minutes, {minimum}–{maximum})',
  'organizationSecurity.retention.label': 'Data retention (days, {minimum}–{maximum})',
  'organizationSecurity.mfa.label': 'Require MFA for admins',
  'organizationSecurity.mfa.description':
    'Organization admins must enrol an authenticator before accessing admin surfaces.',
  'organizationSecurity.legalHold.label': 'Legal hold',
  'organizationSecurity.legalHold.enabledDescription':
    'Legal hold is ON — data deletion is blocked org-wide until it is turned off, even after retention expires.',
  'organizationSecurity.legalHold.disabledDescription':
    'When enabled, blocks all data deletion org-wide (overrides the retention window). Enable only for litigation/compliance holds.',
  'organizationSecurity.legalHold.warning':
    'While legal hold is active, no data — including expired records — can be deleted for this organization.',
  'organizationSecurity.actions.save': 'Save security settings',
  'organizationSecurity.actions.saving': 'Saving security settings…',
  'organizationSecurity.updatedAt': 'Last updated {date}',
  'organizationSecurity.dateUnavailable': 'date unavailable',
} as const;

export type OrganizationSecurityKey = keyof typeof organizationSecurityEn;
export type OrganizationSecurityCopy = Readonly<Record<OrganizationSecurityKey, string>>;

export const organizationSecurityFr: OrganizationSecurityCopy = {
  'organizationSecurity.title': 'Sécurité de l’organisation',
  'organizationSecurity.description':
    'Politique de sécurité de référence pour {organization} : liste d’adresses IP autorisées, durée des sessions, MFA des administrateurs, conservation des données et gel juridique.',
  'organizationSecurity.load.loading': 'Chargement des paramètres de sécurité de l’organisation',
  'organizationSecurity.load.permissionTitle': 'Les paramètres de sécurité sont soumis à restriction',
  'organizationSecurity.load.errorTitle': 'Impossible de charger les paramètres de sécurité',
  'organizationSecurity.load.permissionDescription':
    'Votre rôle ne permet pas de gérer la politique de sécurité de cette organisation. Aucun paramètre ne peut être modifié depuis cette page.',
  'organizationSecurity.load.errorDescription':
    'L’éditeur est masqué afin d’éviter que des valeurs de repli remplacent la politique actuelle. Aucun paramètre n’a été modifié.',
  'organizationSecurity.load.retry': 'Recharger les paramètres de sécurité',
  'organizationSecurity.errors.permissionView':
    'Vous n’êtes pas autorisé à gérer les paramètres de sécurité de cette organisation.',
  'organizationSecurity.errors.temporaryLoad': 'Les paramètres de sécurité sont temporairement indisponibles.',
  'organizationSecurity.errors.organizationUnavailable':
    'Votre organisation est indisponible. Rechargez la page, puis réessayez.',
  'organizationSecurity.errors.invalidIp': 'Adresse IP ou bloc CIDR invalide : {entries}',
  'organizationSecurity.errors.sessionRange':
    'La durée de session doit être comprise entre {minimum} et {maximum} minutes.',
  'organizationSecurity.errors.retentionRange':
    'La durée de conservation doit être comprise entre {minimum} et {maximum} jours.',
  'organizationSecurity.errors.permissionChange':
    'Vous n’êtes pas autorisé à modifier les paramètres de sécurité de cette organisation.',
  'organizationSecurity.errors.save': 'Impossible d’enregistrer les paramètres de sécurité.',
  'organizationSecurity.errors.temporarySave':
    'L’enregistrement des paramètres de sécurité est temporairement indisponible. Réessayez dans quelques instants.',
  'organizationSecurity.success.saved': 'Paramètres de sécurité de l’organisation enregistrés.',
  'organizationSecurity.allowlist.title': 'Liste d’adresses IP autorisées',
  'organizationSecurity.allowlist.description':
    'Seules ces adresses IP ou plages CIDR peuvent accéder à l’organisation. Laissez la liste vide pour tout autoriser.',
  'organizationSecurity.allowlist.placeholder': '203.0.113.10 ou 198.51.100.0/24',
  'organizationSecurity.allowlist.inputAria': 'Adresse IP ou bloc CIDR',
  'organizationSecurity.allowlist.add': 'Ajouter',
  'organizationSecurity.allowlist.invalidDraft':
    'Saisissez une adresse IP ou un bloc CIDR valide, par exemple 203.0.113.10 ou 198.51.100.0/24.',
  'organizationSecurity.allowlist.duplicate': 'Cette entrée figure déjà dans la liste des adresses autorisées.',
  'organizationSecurity.allowlist.removeAria': 'Retirer {entry}',
  'organizationSecurity.allowlist.remove': 'Retirer',
  'organizationSecurity.allowlist.empty': 'Aucune restriction — toutes les adresses IP sont autorisées.',
  'organizationSecurity.session.label': 'Durée de session (minutes, {minimum}–{maximum})',
  'organizationSecurity.retention.label': 'Conservation des données (jours, {minimum}–{maximum})',
  'organizationSecurity.mfa.label': 'Exiger la MFA pour les administrateurs',
  'organizationSecurity.mfa.description':
    'Les administrateurs de l’organisation doivent configurer un authentificateur avant d’accéder aux surfaces d’administration.',
  'organizationSecurity.legalHold.label': 'Gel juridique',
  'organizationSecurity.legalHold.enabledDescription':
    'Le gel juridique est ACTIF — la suppression des données est bloquée dans toute l’organisation jusqu’à sa désactivation, même après l’expiration de la durée de conservation.',
  'organizationSecurity.legalHold.disabledDescription':
    'Une fois activé, il bloque toute suppression de données dans l’organisation et prévaut sur la durée de conservation. Activez-le uniquement en cas de litige ou d’obligation de conformité.',
  'organizationSecurity.legalHold.warning':
    'Tant que le gel juridique est actif, aucune donnée — y compris les enregistrements expirés — ne peut être supprimée pour cette organisation.',
  'organizationSecurity.actions.save': 'Enregistrer les paramètres de sécurité',
  'organizationSecurity.actions.saving': 'Enregistrement des paramètres de sécurité…',
  'organizationSecurity.updatedAt': 'Dernière mise à jour : {date}',
  'organizationSecurity.dateUnavailable': 'date indisponible',
};

export function resolveOrganizationSecurityLanguage(language?: string | null): MarketingLanguage {
  return resolveMarketingLanguage(language);
}

export function getOrganizationSecurityCopy(language?: string | null): OrganizationSecurityCopy {
  return resolveOrganizationSecurityLanguage(language) === 'fr' ? organizationSecurityFr : organizationSecurityEn;
}

export function formatOrganizationSecurityCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatOrganizationSecurityNumber(value: number, language?: string | null): string {
  return new Intl.NumberFormat(resolveOrganizationSecurityLanguage(language) === 'fr' ? 'fr-FR' : 'en-US').format(
    value,
  );
}
