import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export const projectDomainsEn = {
  'projectDomains.meta.title': 'Custom domains - E-Code',
  'projectDomains.meta.description': 'Connect project deployments to verified custom domains with TLS readiness.',
  'projectDomains.error.projectNotFound': 'Project not found.',
  'projectDomains.error.serviceUnavailable': 'The domains service is unavailable. Wait a moment, then try again.',
  'projectDomains.error.organizationMissing':
    'This project is not attached to an organization, so its domains cannot be listed.',
  'projectDomains.error.verificationFailed':
    'Domain verification failed. Check the DNS record, wait for propagation, then try again.',
  'projectDomains.error.addFailed': 'The domain could not be added. Check the value, then try again.',
  'projectDomains.tls.failed': 'TLS: verification failed',
  'projectDomains.tls.active': 'TLS certificate active',
  'projectDomains.tls.pending': 'TLS pending domain verification',
  'projectDomains.page.title': 'Custom domains',
  'projectDomains.page.description': 'Map project deployments to verified domains with TLS readiness.',
  'projectDomains.scope.notice':
    'Domains are verified once for your organization and can then be used by any of its projects. This list is shared across the organization — it is not specific to this project.',
  'projectDomains.activity.verified': 'Verified {date}',
  'projectDomains.activity.dateUnavailable': 'date unavailable',
  'projectDomains.activity.pending': 'Pending DNS verification',
  'projectDomains.activity.emptyTitle': 'No verified domains',
  'projectDomains.activity.emptyDescription': 'Add a domain to create a verification token.',
  'projectDomains.add.title': 'Add your domain',
  'projectDomains.add.ariaLabel': 'Custom domain',
  'projectDomains.add.loading': 'Adding…',
  'projectDomains.add.submit': 'Add domain',
  'projectDomains.dns.title': 'Add the DNS record for {domain}',
  'projectDomains.dns.instructions':
    'Add this TXT record at your domain registrar, then check again after it propagates (usually a few minutes, up to 48 hours).',
  'projectDomains.dns.type': 'Type',
  'projectDomains.dns.name': 'Name / Host',
  'projectDomains.dns.value': 'Value',
  'projectDomains.verify.title': 'Verify & secure',
  'projectDomains.verify.loading': 'Checking again…',
  'projectDomains.verify.submit': 'Check DNS again',
} as const;

export type ProjectDomainsKey = keyof typeof projectDomainsEn;
export type ProjectDomainsCopy = Readonly<Record<ProjectDomainsKey, string>>;

export const projectDomainsFr: ProjectDomainsCopy = {
  'projectDomains.meta.title': 'Domaines personnalisés - E-Code',
  'projectDomains.meta.description':
    'Associez les déploiements du projet à des domaines personnalisés vérifiés et prêts pour TLS.',
  'projectDomains.error.projectNotFound': 'Projet introuvable.',
  'projectDomains.error.serviceUnavailable':
    'Le service des domaines est indisponible. Patientez quelques instants, puis réessayez.',
  'projectDomains.error.organizationMissing':
    "Ce projet n'est rattaché à aucune organisation : ses domaines ne peuvent pas être listés.",
  'projectDomains.error.verificationFailed':
    'La vérification du domaine a échoué. Vérifiez l’enregistrement DNS, attendez sa propagation, puis réessayez.',
  'projectDomains.error.addFailed': 'Impossible d’ajouter le domaine. Vérifiez la valeur, puis réessayez.',
  'projectDomains.tls.failed': 'TLS : échec de la vérification',
  'projectDomains.tls.active': 'Certificat TLS actif',
  'projectDomains.tls.pending': 'TLS en attente de vérification du domaine',
  'projectDomains.page.title': 'Domaines personnalisés',
  'projectDomains.page.description': 'Associez les déploiements du projet à des domaines vérifiés et prêts pour TLS.',
  'projectDomains.scope.notice':
    "Les domaines sont vérifiés une fois pour votre organisation et peuvent ensuite servir à tous ses projets. Cette liste est commune à l'organisation : elle n'est pas propre à ce projet.",
  'projectDomains.activity.verified': 'Vérifié le {date}',
  'projectDomains.activity.dateUnavailable': 'date indisponible',
  'projectDomains.activity.pending': 'Vérification DNS en attente',
  'projectDomains.activity.emptyTitle': 'Aucun domaine vérifié',
  'projectDomains.activity.emptyDescription': 'Ajoutez un domaine pour créer un jeton de vérification.',
  'projectDomains.add.title': 'Ajouter votre domaine',
  'projectDomains.add.ariaLabel': 'Domaine personnalisé',
  'projectDomains.add.loading': 'Ajout…',
  'projectDomains.add.submit': 'Ajouter le domaine',
  'projectDomains.dns.title': 'Ajouter l’enregistrement DNS de {domain}',
  'projectDomains.dns.instructions':
    'Ajoutez cet enregistrement TXT auprès de votre bureau d’enregistrement, puis vérifiez-le à nouveau après sa propagation (généralement quelques minutes, jusqu’à 48 heures).',
  'projectDomains.dns.type': 'Type',
  'projectDomains.dns.name': 'Nom / hôte',
  'projectDomains.dns.value': 'Valeur',
  'projectDomains.verify.title': 'Vérifier et sécuriser',
  'projectDomains.verify.loading': 'Nouvelle vérification…',
  'projectDomains.verify.submit': 'Revérifier le DNS',
};

export function resolveProjectDomainsLanguage(language?: string | null): MarketingLanguage {
  return resolveMarketingLanguage(language);
}

export function getProjectDomainsCopy(language?: string | null): ProjectDomainsCopy {
  return resolveProjectDomainsLanguage(language) === 'fr' ? projectDomainsFr : projectDomainsEn;
}

export function formatProjectDomainsCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
