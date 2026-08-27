import { resolveMarketingLanguage } from './marketing';

export const projectCollaboratorsEn = {
  'projectCollaborators.metaTitle': 'Project collaborators - E-Code',
  'projectCollaborators.title': 'Collaborators',
  'projectCollaborators.description': 'Manage project access with organization RBAC enforcement.',
  'projectCollaborators.role.viewer': 'Viewer — read only',
  'projectCollaborators.role.editor': 'Editor — edit files and run',
  'projectCollaborators.role.owner': 'Admin — full project control',
  'projectCollaborators.role.viewerShort': 'Viewer',
  'projectCollaborators.role.editorShort': 'Editor',
  'projectCollaborators.role.ownerShort': 'Admin',
  'projectCollaborators.expiry.oneHour': '1 hour',
  'projectCollaborators.expiry.twentyFourHours': '24 hours',
  'projectCollaborators.expiry.sevenDays': '7 days',
  'projectCollaborators.expiry.thirtyDays': '30 days',
  'projectCollaborators.add.title': 'Add a member by email',
  'projectCollaborators.email': 'Email',
  'projectCollaborators.role': 'Role',
  'projectCollaborators.add.adding': 'Adding…',
  'projectCollaborators.add.submit': 'Add collaborator',
  'projectCollaborators.invite.createTitle': 'Create an invite link',
  'projectCollaborators.invite.createDescription':
    'Anyone with the link can join with the role you choose until it expires or is revoked.',
  'projectCollaborators.invite.expiresAfter': 'Expires after',
  'projectCollaborators.invite.creating': 'Creating…',
  'projectCollaborators.invite.create': 'Create invite link',
  'projectCollaborators.invite.created': 'Invite link created — copy it now; it will not be shown again.',
  'projectCollaborators.invite.link': 'Invite link',
  'projectCollaborators.invite.copied': 'Copied',
  'projectCollaborators.invite.copy': 'Copy',
  'projectCollaborators.invite.resultRole': 'Role: {role}',
  'projectCollaborators.invite.resultExpires': ' · expires ',
  'projectCollaborators.invite.linksTitle': 'Invite links',
  'projectCollaborators.invite.access': '{role} access',
  'projectCollaborators.invite.revokeAria': 'Revoke the {role} invite link',
  'projectCollaborators.invite.revoke': 'Revoke',
  'projectCollaborators.invite.status.revoked': 'Revoked',
  'projectCollaborators.invite.status.expired': 'Expired',
  'projectCollaborators.invite.status.expires': 'Expires',
  'projectCollaborators.invite.status.active': 'Active',
  'projectCollaborators.empty.title': 'No project collaborators',
  'projectCollaborators.empty.description':
    'Add an organization member by email or share an invite link to grant project access.',
  'projectCollaborators.removeAria': 'Remove {member}',
  'projectCollaborators.removing': 'Removing…',
  'projectCollaborators.remove': 'Remove',
  'projectCollaborators.member.unknown': 'Unknown member',
  'projectCollaborators.member.defaultRole': 'member',
  'projectCollaborators.member.role': 'Role: {role}',
  'projectCollaborators.error.add': 'Unable to add collaborator. Check the email and try again.',
  'projectCollaborators.error.removeRequired': 'Select a collaborator to remove.',
  'projectCollaborators.error.linkRequired': 'Select an invite link to revoke.',
} as const;

export type ProjectCollaboratorsKey = keyof typeof projectCollaboratorsEn;
export type ProjectCollaboratorsCopy = Readonly<Record<ProjectCollaboratorsKey, string>>;

export const projectCollaboratorsFr: ProjectCollaboratorsCopy = {
  'projectCollaborators.metaTitle': 'Collaborateurs du projet - E-Code',
  'projectCollaborators.title': 'Collaborateurs',
  'projectCollaborators.description': 'Gérez les accès au projet avec le contrôle RBAC de l’organisation.',
  'projectCollaborators.role.viewer': 'Lecteur — lecture seule',
  'projectCollaborators.role.editor': 'Éditeur — modifier les fichiers et exécuter',
  'projectCollaborators.role.owner': 'Administrateur — contrôle complet du projet',
  'projectCollaborators.role.viewerShort': 'Lecteur',
  'projectCollaborators.role.editorShort': 'Éditeur',
  'projectCollaborators.role.ownerShort': 'Administrateur',
  'projectCollaborators.expiry.oneHour': '1 heure',
  'projectCollaborators.expiry.twentyFourHours': '24 heures',
  'projectCollaborators.expiry.sevenDays': '7 jours',
  'projectCollaborators.expiry.thirtyDays': '30 jours',
  'projectCollaborators.add.title': 'Ajouter un membre par e-mail',
  'projectCollaborators.email': 'E-mail',
  'projectCollaborators.role': 'Rôle',
  'projectCollaborators.add.adding': 'Ajout…',
  'projectCollaborators.add.submit': 'Ajouter le collaborateur',
  'projectCollaborators.invite.createTitle': 'Créer un lien d’invitation',
  'projectCollaborators.invite.createDescription':
    'Toute personne disposant du lien peut rejoindre le projet avec le rôle choisi, jusqu’à son expiration ou sa révocation.',
  'projectCollaborators.invite.expiresAfter': 'Expire après',
  'projectCollaborators.invite.creating': 'Création…',
  'projectCollaborators.invite.create': 'Créer le lien d’invitation',
  'projectCollaborators.invite.created': 'Lien d’invitation créé — copiez-le maintenant, car il ne sera plus affiché.',
  'projectCollaborators.invite.link': 'Lien d’invitation',
  'projectCollaborators.invite.copied': 'Copié',
  'projectCollaborators.invite.copy': 'Copier',
  'projectCollaborators.invite.resultRole': 'Rôle : {role}',
  'projectCollaborators.invite.resultExpires': ' · expire ',
  'projectCollaborators.invite.linksTitle': 'Liens d’invitation',
  'projectCollaborators.invite.access': 'Accès {role}',
  'projectCollaborators.invite.revokeAria': 'Révoquer le lien d’invitation {role}',
  'projectCollaborators.invite.revoke': 'Révoquer',
  'projectCollaborators.invite.status.revoked': 'Révoqué',
  'projectCollaborators.invite.status.expired': 'Expiré',
  'projectCollaborators.invite.status.expires': 'Expire',
  'projectCollaborators.invite.status.active': 'Actif',
  'projectCollaborators.empty.title': 'Aucun collaborateur sur le projet',
  'projectCollaborators.empty.description':
    'Ajoutez un membre de l’organisation par e-mail ou partagez un lien d’invitation pour accorder l’accès au projet.',
  'projectCollaborators.removeAria': 'Retirer {member}',
  'projectCollaborators.removing': 'Retrait…',
  'projectCollaborators.remove': 'Retirer',
  'projectCollaborators.member.unknown': 'Membre inconnu',
  'projectCollaborators.member.defaultRole': 'membre',
  'projectCollaborators.member.role': 'Rôle : {role}',
  'projectCollaborators.error.add': 'Impossible d’ajouter le collaborateur. Vérifiez l’adresse e-mail, puis réessayez.',
  'projectCollaborators.error.removeRequired': 'Sélectionnez un collaborateur à retirer.',
  'projectCollaborators.error.linkRequired': 'Sélectionnez un lien d’invitation à révoquer.',
};

export function getProjectCollaboratorsCopy(language?: string | null): ProjectCollaboratorsCopy {
  return resolveMarketingLanguage(language) === 'fr' ? projectCollaboratorsFr : projectCollaboratorsEn;
}

export function formatProjectCollaboratorsCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
