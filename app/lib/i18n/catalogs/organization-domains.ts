import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export const organizationDomainsEn = {
  'organizationDomains.metaTitle': 'Verified domains - E-Code',
  'organizationDomains.title': 'Verified domains',
  'organizationDomains.description':
    'Add and verify custom domains for {organization}. Publish a DNS TXT record to prove ownership.',
  'organizationDomains.load.loading': 'Loading verified domains',
  'organizationDomains.load.permissionTitle': 'Domain management is restricted',
  'organizationDomains.load.errorTitle': 'Domains could not load',
  'organizationDomains.load.permissionDescription':
    "You do not have permission to view or change this organization's verified domains.",
  'organizationDomains.load.errorDescription':
    'Domain controls are hidden because the latest request failed. No domain was changed.',
  'organizationDomains.load.retry': 'Reload domains',
  'organizationDomains.errors.organizationUnavailable':
    'Your organization is unavailable. Reload the page and try again.',
  'organizationDomains.errors.domainRequired': 'Enter a domain, for example app.example.com.',
  'organizationDomains.errors.missingDomain': 'Select a domain.',
  'organizationDomains.errors.unknownAction': 'This domain action is not supported.',
  'organizationDomains.errors.permission': "You do not have permission to manage this organization's domains.",
  'organizationDomains.errors.actionFailed': 'The domain action could not be completed.',
  'organizationDomains.errors.temporary': 'This action is temporarily unavailable. Try again in a moment.',
  'organizationDomains.success.added': 'Domain {domain} added. Publish the TXT record below, then verify it.',
  'organizationDomains.success.verified': '{domain} verified.',
  'organizationDomains.success.saved': 'Settings for {domain} saved.',
  'organizationDomains.copy.aria': 'Copy {label}',
  'organizationDomains.copy.copied': 'Copied',
  'organizationDomains.copy.copy': 'Copy',
  'organizationDomains.status.verified': 'Verified',
  'organizationDomains.status.failed': 'Verification failed',
  'organizationDomains.status.pending': 'Pending DNS',
  'organizationDomains.add.title': 'Add a domain',
  'organizationDomains.add.domain': 'Domain',
  'organizationDomains.add.placeholder': 'Domain: app.example.com',
  'organizationDomains.options.redirect.label': 'Redirect www',
  'organizationDomains.options.redirect.description': 'Redirect www.<domain> to the apex domain.',
  'organizationDomains.options.wildcard.label': 'Wildcard',
  'organizationDomains.options.wildcard.description': 'Cover all subdomains (*.<domain>).',
  'organizationDomains.add.submit': 'Add domain',
  'organizationDomains.list.title': 'Domains',
  'organizationDomains.list.empty': 'No domains yet. Add one above to get started.',
  'organizationDomains.dns.instructions':
    'Add this TXT record at your DNS provider, then select Verify domain after it propagates.',
  'organizationDomains.dns.host': 'TXT record name / host',
  'organizationDomains.dns.value': 'TXT record value',
  'organizationDomains.actions.verify': 'Verify domain',
  'organizationDomains.actions.save': 'Save settings',
} as const;

export type OrganizationDomainsKey = keyof typeof organizationDomainsEn;
export type OrganizationDomainsCopy = Readonly<Record<OrganizationDomainsKey, string>>;

export const organizationDomainsFr: OrganizationDomainsCopy = {
  'organizationDomains.metaTitle': 'Domaines vérifiés - E-Code',
  'organizationDomains.title': 'Domaines vérifiés',
  'organizationDomains.description':
    'Ajoutez et vérifiez les domaines personnalisés de {organization}. Publiez un enregistrement DNS TXT pour en prouver la propriété.',
  'organizationDomains.load.loading': 'Chargement des domaines vérifiés',
  'organizationDomains.load.permissionTitle': 'La gestion des domaines est soumise à restriction',
  'organizationDomains.load.errorTitle': 'Impossible de charger les domaines',
  'organizationDomains.load.permissionDescription':
    'Vous n’êtes pas autorisé à consulter ou modifier les domaines vérifiés de cette organisation.',
  'organizationDomains.load.errorDescription':
    'Les commandes des domaines sont masquées, car la dernière demande a échoué. Aucun domaine n’a été modifié.',
  'organizationDomains.load.retry': 'Recharger les domaines',
  'organizationDomains.errors.organizationUnavailable':
    'Votre organisation est indisponible. Rechargez la page, puis réessayez.',
  'organizationDomains.errors.domainRequired': 'Saisissez un domaine, par exemple app.example.com.',
  'organizationDomains.errors.missingDomain': 'Sélectionnez un domaine.',
  'organizationDomains.errors.unknownAction': 'Cette action sur le domaine n’est pas prise en charge.',
  'organizationDomains.errors.permission': 'Vous n’êtes pas autorisé à gérer les domaines de cette organisation.',
  'organizationDomains.errors.actionFailed': 'Impossible d’effectuer cette action sur le domaine.',
  'organizationDomains.errors.temporary':
    'Cette action est temporairement indisponible. Réessayez dans quelques instants.',
  'organizationDomains.success.added':
    'Domaine {domain} ajouté. Publiez l’enregistrement TXT ci-dessous, puis vérifiez-le.',
  'organizationDomains.success.verified': 'Domaine {domain} vérifié.',
  'organizationDomains.success.saved': 'Paramètres de {domain} enregistrés.',
  'organizationDomains.copy.aria': 'Copier {label}',
  'organizationDomains.copy.copied': 'Copié',
  'organizationDomains.copy.copy': 'Copier',
  'organizationDomains.status.verified': 'Vérifié',
  'organizationDomains.status.failed': 'Échec de la vérification',
  'organizationDomains.status.pending': 'DNS en attente',
  'organizationDomains.add.title': 'Ajouter un domaine',
  'organizationDomains.add.domain': 'Domaine',
  'organizationDomains.add.placeholder': 'Domaine : application.exemple.fr',
  'organizationDomains.options.redirect.label': 'Rediriger www',
  'organizationDomains.options.redirect.description': 'Rediriger www.<domaine> vers le domaine racine.',
  'organizationDomains.options.wildcard.label': 'Domaine générique',
  'organizationDomains.options.wildcard.description': 'Couvrir tous les sous-domaines (*.<domaine>).',
  'organizationDomains.add.submit': 'Ajouter le domaine',
  'organizationDomains.list.title': 'Domaines',
  'organizationDomains.list.empty': 'Aucun domaine pour le moment. Ajoutez-en un ci-dessus pour commencer.',
  'organizationDomains.dns.instructions':
    'Ajoutez cet enregistrement TXT auprès de votre fournisseur DNS, puis sélectionnez Vérifier le domaine après sa propagation.',
  'organizationDomains.dns.host': 'Nom / hôte de l’enregistrement TXT',
  'organizationDomains.dns.value': 'Valeur de l’enregistrement TXT',
  'organizationDomains.actions.verify': 'Vérifier le domaine',
  'organizationDomains.actions.save': 'Enregistrer les paramètres',
};

export function getOrganizationDomainsCopy(language?: string | null): OrganizationDomainsCopy {
  return resolveMarketingLanguage(language) === 'fr' ? organizationDomainsFr : organizationDomainsEn;
}

export function resolveOrganizationDomainsLanguage(language?: string | null): MarketingLanguage {
  return resolveMarketingLanguage(language);
}

export function formatOrganizationDomainsCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
