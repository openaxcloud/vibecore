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
  'organizationSecurity.capabilities.title': 'Enterprise capabilities',
  'organizationSecurity.capabilities.description':
    'Live entitlement and provisioning state. A capability is usable only when the API reports it as ready.',
  'organizationSecurity.capabilities.loading': 'Loading Enterprise capabilities',
  'organizationSecurity.capabilities.errorTitle': 'Enterprise capabilities could not load',
  'organizationSecurity.capabilities.errorDescription':
    'The current entitlement state could not be verified. No unavailable capability is presented as active.',
  'organizationSecurity.capabilities.permissionTitle': 'Enterprise capabilities are restricted',
  'organizationSecurity.capabilities.permissionDescription':
    "Your role cannot view this organization's Enterprise capability state.",
  'organizationSecurity.capabilities.retry': 'Reload Enterprise capabilities',
  'organizationSecurity.capabilities.version': 'policy {version}',
  'organizationSecurity.capabilities.plan.starter': 'Starter',
  'organizationSecurity.capabilities.plan.core': 'Core',
  'organizationSecurity.capabilities.plan.pro': 'Pro',
  'organizationSecurity.capabilities.plan.enterprise': 'Enterprise',
  'organizationSecurity.capabilities.state.ready': 'Ready',
  'organizationSecurity.capabilities.state.operatorRequired': 'Operator required',
  'organizationSecurity.capabilities.state.notEntitled': 'Not included',
  'organizationSecurity.capabilities.singleTenant.title': 'Single-tenant runtime',
  'organizationSecurity.capabilities.singleTenant.description':
    'A dedicated tenant created through the platform cloud-tenant factory.',
  'organizationSecurity.capabilities.staticOutboundIp.title': 'Static outbound IP',
  'organizationSecurity.capabilities.staticOutboundIp.description':
    'A provisioned fixed source address for organization workloads.',
  'organizationSecurity.capabilities.vpcPeering.title': 'VPC peering',
  'organizationSecurity.capabilities.vpcPeering.description':
    'A provisioned private network connection to organization infrastructure.',
  'organizationSecurity.capabilities.dataWarehouse.title': 'Data warehouse',
  'organizationSecurity.capabilities.dataWarehouse.description':
    'A provisioned organization warehouse integration for governed analytics.',
  'organizationSecurity.capabilities.securityCenter.title': 'Security Center',
  'organizationSecurity.capabilities.securityCenter.description':
    'Organization-scoped authentication, MFA and security audit events.',
  'organizationSecurity.securityCenter.title': 'Security Center',
  'organizationSecurity.securityCenter.description':
    'Review real organization-scoped security events and their operator resolution state.',
  'organizationSecurity.securityCenter.loading': 'Loading Security Center events',
  'organizationSecurity.securityCenter.errorTitle': 'Security Center events could not load',
  'organizationSecurity.securityCenter.errorDescription':
    'Security events are temporarily unavailable. Retry to fetch the current organization-scoped list.',
  'organizationSecurity.securityCenter.permissionTitle': 'Security Center is restricted',
  'organizationSecurity.securityCenter.permissionDescription':
    "Your role cannot view this organization's Security Center events.",
  'organizationSecurity.securityCenter.operatorTitle': 'Security Center requires an operator',
  'organizationSecurity.securityCenter.operatorDescription':
    'The Enterprise entitlement exists, but an operator must explicitly provision Security Center before events can be opened.',
  'organizationSecurity.securityCenter.notEntitledDescription':
    'Security Center is not included in the current plan. No simulated event feed is shown.',
  'organizationSecurity.securityCenter.retry': 'Reload Security Center',
  'organizationSecurity.securityCenter.openCount': '{count} open',
  'organizationSecurity.securityCenter.emptyTitle': 'No security events',
  'organizationSecurity.securityCenter.emptyDescription':
    'No organization-scoped authentication, MFA or security audit event is currently recorded.',
  'organizationSecurity.securityCenter.open': 'Open',
  'organizationSecurity.securityCenter.resolved': 'Resolved',
  'organizationSecurity.securityCenter.resource': 'Resource',
  'organizationSecurity.securityCenter.actor': 'Actor',
  'organizationSecurity.securityCenter.actorUnknown': 'system or unavailable',
  'organizationSecurity.securityCenter.note': 'Resolution note',
  'organizationSecurity.securityCenter.dateUnavailable': 'Date unavailable',
  'organizationSecurity.securityCenter.loadMore': 'Load more events',
  'organizationSecurity.securityCenter.loadingMore': 'Loading more events…',
  'organizationSecurity.securityCenter.loadMoreErrorTitle': 'More security events could not load',
  'organizationSecurity.securityCenter.loadMoreErrorDescription':
    'The events already shown remain available. Retry the same cursor to continue safely.',
  'organizationSecurity.securityCenter.loadMoreRetry': 'Retry loading events',
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
  'organizationSecurity.capabilities.title': 'Capacités Enterprise',
  'organizationSecurity.capabilities.description':
    'État réel des droits et du provisionnement. Une capacité n’est utilisable que si l’API la déclare prête.',
  'organizationSecurity.capabilities.loading': 'Chargement des capacités Enterprise',
  'organizationSecurity.capabilities.errorTitle': 'Impossible de charger les capacités Enterprise',
  'organizationSecurity.capabilities.errorDescription':
    'L’état actuel des droits n’a pas pu être vérifié. Aucune capacité indisponible n’est présentée comme active.',
  'organizationSecurity.capabilities.permissionTitle': 'Les capacités Enterprise sont soumises à restriction',
  'organizationSecurity.capabilities.permissionDescription':
    'Votre rôle ne permet pas de consulter les capacités Enterprise de cette organisation.',
  'organizationSecurity.capabilities.retry': 'Recharger les capacités Enterprise',
  'organizationSecurity.capabilities.version': 'politique {version}',
  'organizationSecurity.capabilities.plan.starter': 'Starter',
  'organizationSecurity.capabilities.plan.core': 'Core',
  'organizationSecurity.capabilities.plan.pro': 'Pro',
  'organizationSecurity.capabilities.plan.enterprise': 'Enterprise',
  'organizationSecurity.capabilities.state.ready': 'Prête',
  'organizationSecurity.capabilities.state.operatorRequired': 'Opérateur requis',
  'organizationSecurity.capabilities.state.notEntitled': 'Non incluse',
  'organizationSecurity.capabilities.singleTenant.title': 'Environnement mono-tenant',
  'organizationSecurity.capabilities.singleTenant.description':
    'Un tenant dédié créé par la fabrique cloud de la plateforme.',
  'organizationSecurity.capabilities.staticOutboundIp.title': 'Adresse IP sortante fixe',
  'organizationSecurity.capabilities.staticOutboundIp.description':
    'Une adresse source fixe provisionnée pour les charges de travail de l’organisation.',
  'organizationSecurity.capabilities.vpcPeering.title': 'Peering VPC',
  'organizationSecurity.capabilities.vpcPeering.description':
    'Une connexion réseau privée provisionnée vers l’infrastructure de l’organisation.',
  'organizationSecurity.capabilities.dataWarehouse.title': 'Entrepôt de données',
  'organizationSecurity.capabilities.dataWarehouse.description':
    'Une intégration d’entrepôt provisionnée pour les analyses gouvernées de l’organisation.',
  'organizationSecurity.capabilities.securityCenter.title': 'Centre de sécurité',
  'organizationSecurity.capabilities.securityCenter.description':
    'Événements d’authentification, de MFA et d’audit de sécurité limités à l’organisation.',
  'organizationSecurity.securityCenter.title': 'Centre de sécurité',
  'organizationSecurity.securityCenter.description':
    'Consultez les événements de sécurité réels de l’organisation et leur état de résolution par un opérateur.',
  'organizationSecurity.securityCenter.loading': 'Chargement des événements du Centre de sécurité',
  'organizationSecurity.securityCenter.errorTitle': 'Impossible de charger les événements du Centre de sécurité',
  'organizationSecurity.securityCenter.errorDescription':
    'Les événements de sécurité sont temporairement indisponibles. Réessayez pour charger la liste actuelle de l’organisation.',
  'organizationSecurity.securityCenter.permissionTitle': 'Le Centre de sécurité est soumis à restriction',
  'organizationSecurity.securityCenter.permissionDescription':
    'Votre rôle ne permet pas de consulter les événements du Centre de sécurité de cette organisation.',
  'organizationSecurity.securityCenter.operatorTitle': 'Le Centre de sécurité nécessite un opérateur',
  'organizationSecurity.securityCenter.operatorDescription':
    'Le droit Enterprise existe, mais un opérateur doit provisionner explicitement le Centre de sécurité avant l’ouverture des événements.',
  'organizationSecurity.securityCenter.notEntitledDescription':
    'Le Centre de sécurité n’est pas inclus dans l’offre actuelle. Aucun flux d’événements simulé n’est affiché.',
  'organizationSecurity.securityCenter.retry': 'Recharger le Centre de sécurité',
  'organizationSecurity.securityCenter.openCount': '{count} ouvert(s)',
  'organizationSecurity.securityCenter.emptyTitle': 'Aucun événement de sécurité',
  'organizationSecurity.securityCenter.emptyDescription':
    'Aucun événement d’authentification, de MFA ou d’audit de sécurité lié à l’organisation n’est actuellement enregistré.',
  'organizationSecurity.securityCenter.open': 'Ouvert',
  'organizationSecurity.securityCenter.resolved': 'Résolu',
  'organizationSecurity.securityCenter.resource': 'Ressource',
  'organizationSecurity.securityCenter.actor': 'Acteur',
  'organizationSecurity.securityCenter.actorUnknown': 'système ou indisponible',
  'organizationSecurity.securityCenter.note': 'Note de résolution',
  'organizationSecurity.securityCenter.dateUnavailable': 'Date indisponible',
  'organizationSecurity.securityCenter.loadMore': 'Charger plus d’événements',
  'organizationSecurity.securityCenter.loadingMore': 'Chargement d’autres événements…',
  'organizationSecurity.securityCenter.loadMoreErrorTitle': 'Impossible de charger davantage d’événements de sécurité',
  'organizationSecurity.securityCenter.loadMoreErrorDescription':
    'Les événements déjà affichés restent disponibles. Réessayez avec le même curseur pour continuer sans perte.',
  'organizationSecurity.securityCenter.loadMoreRetry': 'Réessayer de charger les événements',
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
