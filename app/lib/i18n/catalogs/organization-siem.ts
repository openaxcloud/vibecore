import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export const organizationSiemEn = {
  'organizationSiem.metaTitle': 'SIEM webhooks - E-Code',
  'organizationSiem.title': 'SIEM webhooks',
  'organizationSiem.description':
    'Stream organization security and abuse events to your SIEM. Deliveries are signed with your secret so your receiver can verify authenticity.',
  'organizationSiem.load.loading': 'Loading SIEM webhooks',
  'organizationSiem.load.permissionTitle': 'SIEM settings are restricted',
  'organizationSiem.load.errorTitle': 'SIEM webhooks could not load',
  'organizationSiem.load.permissionDescription':
    'Ask an organization administrator for access to security event exports.',
  'organizationSiem.load.errorDescription':
    'Webhook controls are hidden because the latest request failed. No endpoint was changed.',
  'organizationSiem.load.retry': 'Reload webhooks',
  'organizationSiem.errors.permissionView':
    'You do not have permission to view SIEM webhooks. Ask an organization administrator for audit export access.',
  'organizationSiem.errors.temporary': 'Configured SIEM webhooks are temporarily unavailable.',
  'organizationSiem.errors.organizationUnavailable': 'Your organization is unavailable. Reload the page and try again.',
  'organizationSiem.errors.missingWebhook': 'Select a webhook.',
  'organizationSiem.errors.urlRequired': 'Webhook URL is required.',
  'organizationSiem.errors.secretLength': 'The signing secret must contain at least 16 characters.',
  'organizationSiem.errors.reauth':
    'For security, confirm your password on the Security page and try again within 5 minutes.',
  'organizationSiem.errors.permissionConfigure':
    'You do not have permission to configure SIEM webhooks. Ask an organization administrator for audit export access.',
  'organizationSiem.errors.save': 'The SIEM webhook could not be saved.',
  'organizationSiem.errors.testStatus':
    'The test event was signed and sent, but your endpoint responded with HTTP {status}.',
  'organizationSiem.errors.testDelivery': 'The test event could not be delivered.',
  'organizationSiem.success.removed': 'SIEM webhook removed. Events will no longer be delivered to that endpoint.',
  'organizationSiem.success.test': 'Test event delivered — your endpoint responded with HTTP {status}.',
  'organizationSiem.success.saved':
    'SIEM webhook saved. Abuse and security events will now be delivered to this endpoint.',
  'organizationSiem.form.addTitle': 'Add a webhook',
  'organizationSiem.form.url': 'Webhook URL',
  'organizationSiem.form.urlPlaceholder': 'https://siem.example.com/ingest/vibecore',
  'organizationSiem.form.secret': 'Signing secret',
  'organizationSiem.form.secretPlaceholder': 'At least 16 characters',
  'organizationSiem.form.status': 'Status',
  'organizationSiem.status.enabled': 'Enabled',
  'organizationSiem.status.disabled': 'Disabled',
  'organizationSiem.form.save': 'Save SIEM webhook',
  'organizationSiem.list.title': 'Configured webhooks',
  'organizationSiem.list.empty': 'No SIEM webhooks configured yet. Add one above to start streaming events.',
  'organizationSiem.list.endpoint': 'Endpoint',
  'organizationSiem.list.status': 'Status',
  'organizationSiem.list.lastDelivered': 'Last delivered',
  'organizationSiem.list.actions': 'Actions',
  'organizationSiem.delivery.last': 'Last delivered {date}',
  'organizationSiem.delivery.none': 'No deliveries yet',
  'organizationSiem.delivery.dateUnavailable': 'date unavailable',
  'organizationSiem.actions.sendAria': 'Send a test event to SIEM webhook {url}',
  'organizationSiem.actions.send': 'Send test event',
  'organizationSiem.actions.deleteAria': 'Delete SIEM webhook {url}',
  'organizationSiem.actions.delete': 'Delete',
  'organizationSiem.auditLogs': 'View and export audit logs',
  'organizationSiem.dialog.title': 'Remove this SIEM webhook?',
  'organizationSiem.dialog.description': 'Events will stop being delivered to it.',
  'organizationSiem.dialog.confirm': 'Remove webhook',
} as const;

export type OrganizationSiemKey = keyof typeof organizationSiemEn;
export type OrganizationSiemCopy = Readonly<Record<OrganizationSiemKey, string>>;

export const organizationSiemFr: OrganizationSiemCopy = {
  'organizationSiem.metaTitle': 'Webhooks SIEM - E-Code',
  'organizationSiem.title': 'Webhooks SIEM',
  'organizationSiem.description':
    'Transmettez les événements de sécurité et d’abus de l’organisation à votre SIEM. Les livraisons sont signées avec votre secret afin que votre récepteur puisse en vérifier l’authenticité.',
  'organizationSiem.load.loading': 'Chargement des webhooks SIEM',
  'organizationSiem.load.permissionTitle': 'Les paramètres SIEM sont soumis à restriction',
  'organizationSiem.load.errorTitle': 'Impossible de charger les webhooks SIEM',
  'organizationSiem.load.permissionDescription':
    'Demandez à un administrateur de l’organisation l’accès aux exports d’événements de sécurité.',
  'organizationSiem.load.errorDescription':
    'Les commandes des webhooks sont masquées, car la dernière demande a échoué. Aucun endpoint n’a été modifié.',
  'organizationSiem.load.retry': 'Recharger les webhooks',
  'organizationSiem.errors.permissionView':
    'Vous n’êtes pas autorisé à consulter les webhooks SIEM. Demandez à un administrateur de l’organisation l’accès aux exports d’audit.',
  'organizationSiem.errors.temporary': 'Les webhooks SIEM configurés sont temporairement indisponibles.',
  'organizationSiem.errors.organizationUnavailable':
    'Votre organisation est indisponible. Rechargez la page, puis réessayez.',
  'organizationSiem.errors.missingWebhook': 'Sélectionnez un webhook.',
  'organizationSiem.errors.urlRequired': 'L’URL du webhook est obligatoire.',
  'organizationSiem.errors.secretLength': 'Le secret de signature doit contenir au moins 16 caractères.',
  'organizationSiem.errors.reauth':
    'Pour votre sécurité, confirmez votre mot de passe sur la page Sécurité, puis réessayez dans les 5 minutes.',
  'organizationSiem.errors.permissionConfigure':
    'Vous n’êtes pas autorisé à configurer les webhooks SIEM. Demandez à un administrateur de l’organisation l’accès aux exports d’audit.',
  'organizationSiem.errors.save': 'Impossible d’enregistrer le webhook SIEM.',
  'organizationSiem.errors.testStatus':
    'L’événement de test a été signé et envoyé, mais votre endpoint a répondu avec le statut HTTP {status}.',
  'organizationSiem.errors.testDelivery': 'Impossible de livrer l’événement de test.',
  'organizationSiem.success.removed': 'Webhook SIEM supprimé. Les événements ne seront plus livrés à cet endpoint.',
  'organizationSiem.success.test': 'Événement de test livré — votre endpoint a répondu avec le statut HTTP {status}.',
  'organizationSiem.success.saved':
    'Webhook SIEM enregistré. Les événements d’abus et de sécurité seront désormais livrés à cet endpoint.',
  'organizationSiem.form.addTitle': 'Ajouter un webhook',
  'organizationSiem.form.url': 'URL du webhook',
  'organizationSiem.form.urlPlaceholder': 'https://siem.example.com/ingest/vibecore',
  'organizationSiem.form.secret': 'Secret de signature',
  'organizationSiem.form.secretPlaceholder': 'Au moins 16 caractères',
  'organizationSiem.form.status': 'État',
  'organizationSiem.status.enabled': 'Activé',
  'organizationSiem.status.disabled': 'Désactivé',
  'organizationSiem.form.save': 'Enregistrer le webhook SIEM',
  'organizationSiem.list.title': 'Webhooks configurés',
  'organizationSiem.list.empty':
    'Aucun webhook SIEM n’est encore configuré. Ajoutez-en un ci-dessus pour commencer à transmettre les événements.',
  'organizationSiem.list.endpoint': 'Endpoint',
  'organizationSiem.list.status': 'État',
  'organizationSiem.list.lastDelivered': 'Dernière livraison',
  'organizationSiem.list.actions': 'Actions',
  'organizationSiem.delivery.last': 'Dernière livraison le {date}',
  'organizationSiem.delivery.none': 'Aucune livraison pour le moment',
  'organizationSiem.delivery.dateUnavailable': 'date indisponible',
  'organizationSiem.actions.sendAria': 'Envoyer un événement de test au webhook SIEM {url}',
  'organizationSiem.actions.send': 'Envoyer un événement de test',
  'organizationSiem.actions.deleteAria': 'Supprimer le webhook SIEM {url}',
  'organizationSiem.actions.delete': 'Supprimer',
  'organizationSiem.auditLogs': 'Consulter et exporter les journaux d’audit',
  'organizationSiem.dialog.title': 'Supprimer ce webhook SIEM ?',
  'organizationSiem.dialog.description': 'Les événements ne lui seront plus livrés.',
  'organizationSiem.dialog.confirm': 'Supprimer le webhook',
};

export function getOrganizationSiemCopy(language?: string | null): OrganizationSiemCopy {
  return resolveMarketingLanguage(language) === 'fr' ? organizationSiemFr : organizationSiemEn;
}

export function formatOrganizationSiemCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function resolveOrganizationSiemLanguage(language?: string | null): MarketingLanguage {
  return resolveMarketingLanguage(language);
}
