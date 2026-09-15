import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';
import { formatUserAreaDateTime, formatUserAreaNumber, USER_AREA_TIME_ZONE } from '~/lib/i18n/user-area-locale';

export const auditLogsEn = {
  'auditLogs.metaTitle': 'Audit logs - E-Code',
  'auditLogs.metaDescription': 'Review and export security-relevant events for your E-Code organization.',
  'auditLogs.title': 'Audit logs',
  'auditLogs.description':
    'Review and export security-relevant organization events to CSV or JSON. Route deliveries to a SIEM from the SIEM webhooks page.',
  'auditLogs.load.loading': 'Loading audit logs',
  'auditLogs.load.permissionTitle': 'Audit logs are restricted',
  'auditLogs.load.errorTitle': 'Audit logs could not load',
  'auditLogs.load.permissionDescription':
    'Ask an organization administrator for access to the organization audit trail.',
  'auditLogs.load.errorDescription':
    'Events and exports are hidden because the latest request failed. No audit data was changed.',
  'auditLogs.load.retry': 'Reload audit logs',
  'auditLogs.error.exportForbidden':
    'You do not have permission to export audit logs. Ask an organization administrator for audit export access.',
  'auditLogs.error.exportFailed': 'The audit export could not be prepared. Try the download again.',
  'auditLogs.export.title': 'Export',
  'auditLogs.export.description':
    'Download the full audit trail. Your signed-in account is used to prepare the export securely.',
  'auditLogs.export.csv': 'Export CSV',
  'auditLogs.export.json': 'Export JSON',
  'auditLogs.export.fileName': 'audit-logs',
  'auditLogs.recent.title': 'Recent events',
  'auditLogs.filter.action': 'Action',
  'auditLogs.filter.all': 'All actions',
  'auditLogs.pagination.aria': 'Audit log pages',
  'auditLogs.pagination.previous': 'Previous',
  'auditLogs.pagination.next': 'Next',
  'auditLogs.pagination.status': 'Events {from}–{to} of {total}',
  'auditLogs.pagination.page': 'Page {page} of {pages}',
  'auditLogs.filter.count_one': '{count} event shown',
  'auditLogs.filter.count_other': '{count} events shown',
  'auditLogs.empty': 'No audit events have been recorded for this organization yet.',
  'auditLogs.emptyFiltered': 'No audit event matches this action.',
  'auditLogs.table.aria': 'Organization audit events',
  'auditLogs.table.time': 'Time',
  'auditLogs.table.action': 'Action',
  'auditLogs.table.resource': 'Resource',
  'auditLogs.table.actor': 'Actor',
  'auditLogs.table.ip': 'IP address',
  'auditLogs.actor.member': 'Organization member',
  'auditLogs.actor.system': 'System',
  'auditLogs.date.unavailable': 'Date unavailable',
  'auditLogs.action.recorded': 'Recorded action',
  'auditLogs.resource.recorded': 'Recorded resource',
  'auditLogs.siem': 'Configure SIEM webhooks',
} as const;

export type AuditLogsKey = keyof typeof auditLogsEn;
export type AuditLogsCopy = Readonly<Record<AuditLogsKey, string>>;
export type AuditLogsLanguage = MarketingLanguage;

export const auditLogsFr: AuditLogsCopy = {
  'auditLogs.metaTitle': 'Journaux d’audit - E-Code',
  'auditLogs.metaDescription': 'Consultez et exportez les événements de sécurité de votre organisation E-Code.',
  'auditLogs.title': 'Journaux d’audit',
  'auditLogs.description':
    'Consultez et exportez les événements de sécurité de l’organisation au format CSV ou JSON. Configurez leur transmission vers un SIEM depuis la page Webhooks SIEM.',
  'auditLogs.load.loading': 'Chargement des journaux d’audit',
  'auditLogs.load.permissionTitle': 'L’accès aux journaux d’audit est restreint',
  'auditLogs.load.errorTitle': 'Impossible de charger les journaux d’audit',
  'auditLogs.load.permissionDescription': 'Demandez à un administrateur de l’organisation l’accès à la piste d’audit.',
  'auditLogs.load.errorDescription':
    'Les événements et les exports sont masqués, car la dernière requête a échoué. Aucune donnée d’audit n’a été modifiée.',
  'auditLogs.load.retry': 'Recharger les journaux d’audit',
  'auditLogs.error.exportForbidden':
    'Vous n’êtes pas autorisé à exporter les journaux d’audit. Demandez à un administrateur de l’organisation l’accès aux exports d’audit.',
  'auditLogs.error.exportFailed': 'Impossible de préparer l’export d’audit. Relancez le téléchargement.',
  'auditLogs.export.title': 'Exporter',
  'auditLogs.export.description':
    'Téléchargez l’intégralité de la piste d’audit. Votre compte connecté est utilisé pour préparer l’export de manière sécurisée.',
  'auditLogs.export.csv': 'Exporter en CSV',
  'auditLogs.export.json': 'Exporter en JSON',
  'auditLogs.export.fileName': 'journaux-audit',
  'auditLogs.recent.title': 'Événements récents',
  'auditLogs.filter.action': 'Action',
  'auditLogs.filter.all': 'Toutes les actions',
  'auditLogs.pagination.aria': 'Pages du journal d’activité',
  'auditLogs.pagination.previous': 'Précédent',
  'auditLogs.pagination.next': 'Suivant',
  'auditLogs.pagination.status': 'Événements {from} à {to} sur {total}',
  'auditLogs.pagination.page': 'Page {page} sur {pages}',
  'auditLogs.filter.count_one': '{count} événement affiché',
  'auditLogs.filter.count_other': '{count} événements affichés',
  'auditLogs.empty': 'Aucun événement d’audit n’a encore été enregistré pour cette organisation.',
  'auditLogs.emptyFiltered': 'Aucun événement d’audit ne correspond à cette action.',
  'auditLogs.table.aria': 'Événements d’audit de l’organisation',
  'auditLogs.table.time': 'Date et heure',
  'auditLogs.table.action': 'Action',
  'auditLogs.table.resource': 'Ressource',
  'auditLogs.table.actor': 'Auteur',
  'auditLogs.table.ip': 'Adresse IP',
  'auditLogs.actor.member': 'Membre de l’organisation',
  'auditLogs.actor.system': 'Système',
  'auditLogs.date.unavailable': 'Date indisponible',
  'auditLogs.action.recorded': 'Action enregistrée',
  'auditLogs.resource.recorded': 'Ressource enregistrée',
  'auditLogs.siem': 'Configurer les webhooks SIEM',
};

const actionLabelsEn = {
  'account.data_export': 'Account data exported',
  'account.deletion_cancelled': 'Account deletion cancelled',
  'account.deletion_requested': 'Account deletion requested',
  'ai.conversation.create': 'AI conversation created',
  'ai.message.create': 'AI message created',
  'api_key.create': 'API key created',
  'api_key.revoke': 'API key revoked',
  'audit.export': 'Audit log exported',
  'auth.email.verify': 'Email address verified',
  'auth.login': 'Signed in',
  'auth.logout': 'Signed out',
  'auth.mfa.disable': 'Two-factor authentication disabled',
  'auth.mfa.enable': 'Two-factor authentication enabled',
  'auth.password.update': 'Password updated',
  'auth.profile.update': 'Profile updated',
  'auth.reauth': 'Identity reconfirmed',
  'auth.register': 'Account created',
  'auth.session.revoke': 'Session revoked',
  'auth.session.revoke_all': 'All other sessions revoked',
  'billing.checkout.create': 'Billing checkout opened',
  'billing.portal.create': 'Billing portal opened',
  'database.restore.request': 'Database restore requested',
  'deployment.cancel': 'Deployment cancelled',
  'deployment.create': 'Deployment created',
  'deployment.publish': 'Deployment published',
  'deployment.redeploy': 'Deployment restarted',
  'deployment.rollback': 'Deployment rolled back',
  'domain.config.update': 'Domain settings updated',
  'domain.create': 'Domain added',
  'domain.verify': 'Domain verified',
  'enterprise.settings.update': 'Enterprise settings updated',
  'git.commit': 'Git commit created',
  'git.pr.create': 'Pull request created',
  'git.pull': 'Git changes pulled',
  'git.push': 'Git changes pushed',
  'invite.accept': 'Invitation accepted',
  'invite.create': 'Invitation created',
  'invite.expire': 'Invitation expired',
  'invite.resend': 'Invitation resent',
  'member.add': 'Member added',
  'member.remove': 'Member removed',
  'member.updateRole': 'Member role updated',
  'org.create': 'Organization created',
  'project.collaborator.add': 'Project collaborator added',
  'project.collaborator.remove': 'Project collaborator removed',
  'project.create': 'Project created',
  'project.create_from_ai': 'Project created with AI',
  'project.create_from_template': 'Project created from a template',
  'project.delete': 'Project deleted',
  'project.duplicate': 'Project duplicated',
  'project.env.delete': 'Environment variable deleted',
  'project.env.upsert': 'Environment variable saved',
  'project.export_zip': 'Project exported',
  'project.hard_delete': 'Project permanently deleted',
  'project.import_github': 'GitHub project imported',
  'project.import_zip': 'ZIP project imported',
  'project.restore': 'Project restored',
  'project.secret.delete': 'Secret deleted',
  'project.secret.upsert': 'Secret saved',
  'project.settings.update': 'Project settings updated',
  'project.soft_delete': 'Project moved to trash',
  'project.transfer': 'Project transferred',
  'role.create': 'Role created',
  'runtime.workspace.restart': 'Workspace restarted',
  'runtime.workspace.start': 'Workspace started',
  'runtime.workspace.stop': 'Workspace stopped',
  'scim.token.create': 'SCIM token created',
  'scim.token.revoke': 'SCIM token revoked',
  'scim.token.rotate': 'SCIM token rotated',
  'siem.webhook.create': 'SIEM webhook created',
  'siem.webhook.delete': 'SIEM webhook deleted',
  'siem.webhook.test': 'SIEM webhook tested',
  'snapshot.create': 'Snapshot created',
  'snapshot.restore': 'Snapshot restored',
  'sso.enforcement.update': 'SSO enforcement updated',
  'sso.oidc.update': 'OIDC configuration updated',
  'sso.saml.update': 'SAML configuration updated',
  'support.ticket.create': 'Support ticket opened',
  'support.ticket.reply': 'Support ticket reply added',
  'user.preferences.update': 'User preferences updated',
  'workspace.create': 'Workspace created',
} as const;

const actionLabelsFr: Readonly<Record<keyof typeof actionLabelsEn, string>> = {
  'account.data_export': 'Données du compte exportées',
  'account.deletion_cancelled': 'Suppression du compte annulée',
  'account.deletion_requested': 'Suppression du compte demandée',
  'ai.conversation.create': 'Conversation avec l’IA créée',
  'ai.message.create': 'Message à l’IA créé',
  'api_key.create': 'Clé API créée',
  'api_key.revoke': 'Clé API révoquée',
  'audit.export': 'Journal d’audit exporté',
  'auth.email.verify': 'Adresse e-mail vérifiée',
  'auth.login': 'Connexion au compte',
  'auth.logout': 'Déconnexion du compte',
  'auth.mfa.disable': 'Authentification à deux facteurs désactivée',
  'auth.mfa.enable': 'Authentification à deux facteurs activée',
  'auth.password.update': 'Mot de passe modifié',
  'auth.profile.update': 'Profil mis à jour',
  'auth.reauth': 'Identité reconfirmée',
  'auth.register': 'Compte créé',
  'auth.session.revoke': 'Session révoquée',
  'auth.session.revoke_all': 'Toutes les autres sessions révoquées',
  'billing.checkout.create': 'Paiement de facturation ouvert',
  'billing.portal.create': 'Portail de facturation ouvert',
  'database.restore.request': 'Restauration de la base de données demandée',
  'deployment.cancel': 'Déploiement annulé',
  'deployment.create': 'Déploiement créé',
  'deployment.publish': 'Déploiement publié',
  'deployment.redeploy': 'Déploiement relancé',
  'deployment.rollback': 'Déploiement restauré à une version antérieure',
  'domain.config.update': 'Paramètres du domaine mis à jour',
  'domain.create': 'Domaine ajouté',
  'domain.verify': 'Domaine vérifié',
  'enterprise.settings.update': 'Paramètres d’entreprise mis à jour',
  'git.commit': 'Commit Git créé',
  'git.pr.create': 'Pull request créée',
  'git.pull': 'Modifications Git récupérées',
  'git.push': 'Modifications Git envoyées',
  'invite.accept': 'Invitation acceptée',
  'invite.create': 'Invitation créée',
  'invite.expire': 'Invitation expirée',
  'invite.resend': 'Invitation renvoyée',
  'member.add': 'Membre ajouté',
  'member.remove': 'Membre retiré',
  'member.updateRole': 'Rôle du membre mis à jour',
  'org.create': 'Organisation créée',
  'project.collaborator.add': 'Collaborateur ajouté au projet',
  'project.collaborator.remove': 'Collaborateur retiré du projet',
  'project.create': 'Projet créé',
  'project.create_from_ai': 'Projet créé avec l’IA',
  'project.create_from_template': 'Projet créé à partir d’un modèle',
  'project.delete': 'Projet supprimé',
  'project.duplicate': 'Projet dupliqué',
  'project.env.delete': 'Variable d’environnement supprimée',
  'project.env.upsert': 'Variable d’environnement enregistrée',
  'project.export_zip': 'Projet exporté',
  'project.hard_delete': 'Projet supprimé définitivement',
  'project.import_github': 'Projet GitHub importé',
  'project.import_zip': 'Projet ZIP importé',
  'project.restore': 'Projet restauré',
  'project.secret.delete': 'Secret supprimé',
  'project.secret.upsert': 'Secret enregistré',
  'project.settings.update': 'Paramètres du projet mis à jour',
  'project.soft_delete': 'Projet placé dans la corbeille',
  'project.transfer': 'Projet transféré',
  'role.create': 'Rôle créé',
  'runtime.workspace.restart': 'Espace de travail redémarré',
  'runtime.workspace.start': 'Espace de travail démarré',
  'runtime.workspace.stop': 'Espace de travail arrêté',
  'scim.token.create': 'Jeton SCIM créé',
  'scim.token.revoke': 'Jeton SCIM révoqué',
  'scim.token.rotate': 'Jeton SCIM renouvelé',
  'siem.webhook.create': 'Webhook SIEM créé',
  'siem.webhook.delete': 'Webhook SIEM supprimé',
  'siem.webhook.test': 'Webhook SIEM testé',
  'snapshot.create': 'Snapshot créé',
  'snapshot.restore': 'Snapshot restauré',
  'sso.enforcement.update': 'Application du SSO mise à jour',
  'sso.oidc.update': 'Configuration OIDC mise à jour',
  'sso.saml.update': 'Configuration SAML mise à jour',
  'support.ticket.create': 'Demande d’assistance ouverte',
  'support.ticket.reply': 'Réponse ajoutée à la demande d’assistance',
  'user.preferences.update': 'Préférences utilisateur mises à jour',
  'workspace.create': 'Espace de travail créé',
};

const resourceLabelsEn: Readonly<Record<string, string>> = {
  apiKey: 'API key',
  auditLog: 'Audit log',
  database: 'Database',
  deployment: 'Deployment',
  domain: 'Domain',
  invitation: 'Invitation',
  organization: 'Organization',
  project: 'Project',
  role: 'Role',
  session: 'Session',
  siemWebhook: 'SIEM webhook',
  snapshot: 'Snapshot',
  supportTicket: 'Support ticket',
  user: 'User account',
  workspace: 'Workspace',
};

const resourceLabelsFr: Readonly<Record<string, string>> = {
  apiKey: 'Clé API',
  auditLog: 'Journal d’audit',
  database: 'Base de données',
  deployment: 'Déploiement',
  domain: 'Domaine',
  invitation: 'Invitation',
  organization: 'Organisation',
  project: 'Projet',
  role: 'Rôle',
  session: 'Session',
  siemWebhook: 'Webhook SIEM',
  snapshot: 'Snapshot',
  supportTicket: 'Demande d’assistance',
  user: 'Compte utilisateur',
  workspace: 'Espace de travail',
};

export function resolveAuditLogsLanguage(language?: string | null): AuditLogsLanguage {
  return resolveMarketingLanguage(language);
}

export function getAuditLogsCopy(language?: string | null): AuditLogsCopy {
  return resolveAuditLogsLanguage(language) === 'fr' ? auditLogsFr : auditLogsEn;
}

export function formatAuditLogsCopy(template: string, values: Readonly<Record<string, string | number>> = {}): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function auditActionLabel(action: string | undefined, language?: string | null): string {
  const copy = getAuditLogsCopy(language);

  if (!action) {
    return copy['auditLogs.action.recorded'];
  }

  const labels = resolveAuditLogsLanguage(language) === 'fr' ? actionLabelsFr : actionLabelsEn;

  /*
   * Unknown values remain verbatim because they are immutable technical
   * identifiers, not prose supplied by the platform or by the user.
   */
  return labels[action as keyof typeof actionLabelsEn] ?? action;
}

export function auditResourceLabel(resource: string | undefined, language?: string | null): string {
  const copy = getAuditLogsCopy(language);

  if (!resource) {
    return copy['auditLogs.resource.recorded'];
  }

  const labels = resolveAuditLogsLanguage(language) === 'fr' ? resourceLabelsFr : resourceLabelsEn;

  return labels[resource] ?? resource;
}

export function formatAuditTimestamp(value: string | undefined, language?: string | null): string {
  const resolvedLanguage = resolveAuditLogsLanguage(language);

  if (!value) {
    return '—';
  }

  return (
    formatUserAreaDateTime(
      value,
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: USER_AREA_TIME_ZONE,
        timeZoneName: 'short',
      },
      resolvedLanguage,
    ) ?? getAuditLogsCopy(resolvedLanguage)['auditLogs.date.unavailable']
  );
}

export function formatAuditEventCount(count: number, language?: string | null): string {
  const resolvedLanguage = resolveAuditLogsLanguage(language);
  const copy = getAuditLogsCopy(resolvedLanguage);
  const key = count === 1 ? 'auditLogs.filter.count_one' : 'auditLogs.filter.count_other';

  return formatAuditLogsCopy(copy[key], {
    count: formatUserAreaNumber(count, undefined, resolvedLanguage),
  });
}
