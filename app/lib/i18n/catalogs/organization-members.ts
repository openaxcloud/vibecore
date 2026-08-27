import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export const organizationMembersEn = {
  'organizationMembers.metaTitle': 'Organization members - E-Code',
  'organizationMembers.title': 'Organization members',
  'organizationMembers.description': 'Invite members, assign roles and review access across your organization.',
  'organizationMembers.defaultOrganization': 'Organization',
  'organizationMembers.errors.noOrganization': 'No organization was found.',
  'organizationMembers.errors.permissionLoad': "You don't have permission to manage this organization's members.",
  'organizationMembers.errors.temporaryLoad': 'Organization members are temporarily unavailable.',
  'organizationMembers.errors.emailRequired': 'Enter an email address to send an invitation.',
  'organizationMembers.errors.invitationFailed': 'The invitation could not be sent.',
  'organizationMembers.errors.invitationRequired': 'Choose an invitation and try again.',
  'organizationMembers.errors.invitationAction': 'The invitation action could not be completed.',
  'organizationMembers.errors.memberRequired': 'Choose a member and try again.',
  'organizationMembers.errors.invalidAction': 'Choose a valid member action.',
  'organizationMembers.errors.memberForbidden': 'You cannot manage members for this organization.',
  'organizationMembers.success.invited': 'Invitation sent to {email}.',
  'organizationMembers.success.inviteResent': 'Invitation resent.',
  'organizationMembers.success.inviteRevoked': 'Invitation revoked.',
  'organizationMembers.success.removed': 'Member removed.',
  'organizationMembers.success.updated': 'Member role updated.',
  'organizationMembers.success.transferred': 'Ownership transferred. You are now an admin of this organization.',
  'organizationMembers.success.added': 'Member added.',
  'organizationMembers.load.loading': 'Loading organization members',
  'organizationMembers.load.permissionTitle': 'Member management is restricted',
  'organizationMembers.load.errorTitle': 'Members could not load',
  'organizationMembers.load.permissionDescription':
    "Your role cannot manage this organization's members. Invitations and member controls are hidden.",
  'organizationMembers.load.errorDescription':
    'Member and invitation controls are hidden because the latest request failed. No access was changed.',
  'organizationMembers.invite.email': 'Invite by email',
  'organizationMembers.invite.emailPlaceholder': 'teammate@company.com',
  'organizationMembers.invite.role': 'Role',
  'organizationMembers.invite.send': 'Send invite',
  'organizationMembers.invite.help':
    'We’ll email an invitation link. They join with the selected role once they accept.',
  'organizationMembers.members.title': 'Members',
  'organizationMembers.members.description': 'Role changes take effect as soon as you save them.',
  'organizationMembers.members.empty': 'No members found.',
  'organizationMembers.members.fallback': 'Organization member',
  'organizationMembers.members.fallbackIndexed': 'Organization member {index}',
  'organizationMembers.members.roleAria': 'Role for {member}',
  'organizationMembers.members.updateAria': 'Update role for {member}',
  'organizationMembers.members.update': 'Update',
  'organizationMembers.members.transferTitle': 'Make this member the organization owner. You will be demoted to admin.',
  'organizationMembers.members.transferAria': 'Transfer ownership to {member}',
  'organizationMembers.members.transfer': 'Transfer ownership',
  'organizationMembers.members.removeAria': 'Remove {member}',
  'organizationMembers.members.remove': 'Remove',
  'organizationMembers.members.lastOwnerRole':
    'The last owner cannot be demoted. Transfer ownership to another member first.',
  'organizationMembers.members.lastOwnerRemove': 'The last owner cannot be removed. Transfer ownership first.',
  'organizationMembers.role.viewer': 'Viewer',
  'organizationMembers.role.member': 'Member',
  'organizationMembers.role.admin': 'Admin',
  'organizationMembers.role.owner': 'Owner',
  'organizationMembers.transfer.title': 'Transfer ownership',
  'organizationMembers.transfer.description':
    '{member} will become the owner of {organization} and you will be demoted to admin. You will not be able to undo this operation yourself.',
  'organizationMembers.transfer.confirmInstruction': 'Type {organization} to confirm',
  'organizationMembers.transfer.cancel': 'Cancel',
  'organizationMembers.transfer.disabledTitle': 'Type the organization name exactly to enable the transfer.',
  'organizationMembers.transfer.busy': 'Transferring…',
  'organizationMembers.transfer.confirm': 'Transfer ownership',
  'organizationMembers.remove.title': 'Remove this member from the organization?',
  'organizationMembers.remove.description': 'They will immediately lose access to the organization.',
  'organizationMembers.remove.confirm': 'Remove member',
  'organizationMembers.pending.title': 'Pending invitations',
  'organizationMembers.pending.description':
    'Resend sends a fresh invitation link (once per minute per invite); revoke stops the link working immediately.',
  'organizationMembers.pending.empty': 'No pending invitations.',
  'organizationMembers.pending.invited': 'Invited',
  'organizationMembers.pending.expires': 'Expires',
  'organizationMembers.pending.expired': 'Expired',
  'organizationMembers.pending.resendAria': 'Resend invitation to {email}',
  'organizationMembers.pending.resend': 'Resend',
  'organizationMembers.pending.revokeAria': 'Revoke invitation to {email}',
  'organizationMembers.pending.revoke': 'Revoke',
  'organizationMembers.pending.dialogTitle': 'Revoke the invitation for {email}?',
  'organizationMembers.pending.dialogDescription': 'The invite link stops working immediately.',
  'organizationMembers.pending.dialogConfirm': 'Revoke invitation',
} as const;

export type OrganizationMembersKey = keyof typeof organizationMembersEn;
export type OrganizationMembersCopy = Readonly<Record<OrganizationMembersKey, string>>;

export const organizationMembersFr: OrganizationMembersCopy = {
  'organizationMembers.metaTitle': 'Membres de l’organisation - E-Code',
  'organizationMembers.title': 'Membres de l’organisation',
  'organizationMembers.description':
    'Invitez des membres, attribuez des rôles et examinez les accès dans toute votre organisation.',
  'organizationMembers.defaultOrganization': 'Organisation',
  'organizationMembers.errors.noOrganization': 'Aucune organisation n’a été trouvée.',
  'organizationMembers.errors.permissionLoad': 'Vous n’êtes pas autorisé à gérer les membres de cette organisation.',
  'organizationMembers.errors.temporaryLoad': 'Les membres de l’organisation sont temporairement indisponibles.',
  'organizationMembers.errors.emailRequired': 'Saisissez une adresse e-mail pour envoyer une invitation.',
  'organizationMembers.errors.invitationFailed': 'Impossible d’envoyer l’invitation.',
  'organizationMembers.errors.invitationRequired': 'Choisissez une invitation, puis réessayez.',
  'organizationMembers.errors.invitationAction': 'Impossible de terminer l’action sur l’invitation.',
  'organizationMembers.errors.memberRequired': 'Choisissez un membre, puis réessayez.',
  'organizationMembers.errors.invalidAction': 'Choisissez une action valide pour le membre.',
  'organizationMembers.errors.memberForbidden': 'Vous ne pouvez pas gérer les membres de cette organisation.',
  'organizationMembers.success.invited': 'Invitation envoyée à {email}.',
  'organizationMembers.success.inviteResent': 'Invitation renvoyée.',
  'organizationMembers.success.inviteRevoked': 'Invitation révoquée.',
  'organizationMembers.success.removed': 'Membre retiré.',
  'organizationMembers.success.updated': 'Rôle du membre mis à jour.',
  'organizationMembers.success.transferred':
    'Propriété transférée. Vous êtes maintenant administrateur de cette organisation.',
  'organizationMembers.success.added': 'Membre ajouté.',
  'organizationMembers.load.loading': 'Chargement des membres de l’organisation',
  'organizationMembers.load.permissionTitle': 'La gestion des membres est soumise à restriction',
  'organizationMembers.load.errorTitle': 'Impossible de charger les membres',
  'organizationMembers.load.permissionDescription':
    'Votre rôle ne permet pas de gérer les membres de cette organisation. Les invitations et les commandes des membres sont masquées.',
  'organizationMembers.load.errorDescription':
    'Les commandes des membres et des invitations sont masquées, car la dernière demande a échoué. Aucun accès n’a été modifié.',
  'organizationMembers.invite.email': 'Inviter par e-mail',
  'organizationMembers.invite.emailPlaceholder': 'coequipier@entreprise.fr',
  'organizationMembers.invite.role': 'Rôle',
  'organizationMembers.invite.send': 'Envoyer l’invitation',
  'organizationMembers.invite.help':
    'Nous enverrons un lien d’invitation par e-mail. La personne rejoindra l’organisation avec le rôle choisi après acceptation.',
  'organizationMembers.members.title': 'Membres',
  'organizationMembers.members.description': 'Les changements de rôle prennent effet dès leur enregistrement.',
  'organizationMembers.members.empty': 'Aucun membre trouvé.',
  'organizationMembers.members.fallback': 'Membre de l’organisation',
  'organizationMembers.members.fallbackIndexed': 'Membre de l’organisation {index}',
  'organizationMembers.members.roleAria': 'Rôle de {member}',
  'organizationMembers.members.updateAria': 'Mettre à jour le rôle de {member}',
  'organizationMembers.members.update': 'Mettre à jour',
  'organizationMembers.members.transferTitle':
    'Faire de ce membre le propriétaire de l’organisation. Vous deviendrez administrateur.',
  'organizationMembers.members.transferAria': 'Transférer la propriété à {member}',
  'organizationMembers.members.transfer': 'Transférer la propriété',
  'organizationMembers.members.removeAria': 'Retirer {member}',
  'organizationMembers.members.remove': 'Retirer',
  'organizationMembers.members.lastOwnerRole':
    'Le dernier propriétaire ne peut pas être rétrogradé. Transférez d’abord la propriété à un autre membre.',
  'organizationMembers.members.lastOwnerRemove':
    'Le dernier propriétaire ne peut pas être retiré. Transférez d’abord la propriété.',
  'organizationMembers.role.viewer': 'Lecteur',
  'organizationMembers.role.member': 'Membre',
  'organizationMembers.role.admin': 'Administrateur',
  'organizationMembers.role.owner': 'Propriétaire',
  'organizationMembers.transfer.title': 'Transférer la propriété',
  'organizationMembers.transfer.description':
    '{member} deviendra propriétaire de {organization} et vous deviendrez administrateur. Vous ne pourrez pas annuler vous-même cette opération.',
  'organizationMembers.transfer.confirmInstruction': 'Saisissez {organization} pour confirmer',
  'organizationMembers.transfer.cancel': 'Annuler',
  'organizationMembers.transfer.disabledTitle':
    'Saisissez exactement le nom de l’organisation pour activer le transfert.',
  'organizationMembers.transfer.busy': 'Transfert…',
  'organizationMembers.transfer.confirm': 'Transférer la propriété',
  'organizationMembers.remove.title': 'Retirer ce membre de l’organisation ?',
  'organizationMembers.remove.description': 'Cette personne perdra immédiatement l’accès à l’organisation.',
  'organizationMembers.remove.confirm': 'Retirer le membre',
  'organizationMembers.pending.title': 'Invitations en attente',
  'organizationMembers.pending.description':
    'Renvoyer crée un nouveau lien d’invitation (une fois par minute et par invitation) ; révoquer invalide immédiatement le lien.',
  'organizationMembers.pending.empty': 'Aucune invitation en attente.',
  'organizationMembers.pending.invited': 'Invité le',
  'organizationMembers.pending.expires': 'Expire le',
  'organizationMembers.pending.expired': 'Expirée',
  'organizationMembers.pending.resendAria': 'Renvoyer l’invitation à {email}',
  'organizationMembers.pending.resend': 'Renvoyer',
  'organizationMembers.pending.revokeAria': 'Révoquer l’invitation de {email}',
  'organizationMembers.pending.revoke': 'Révoquer',
  'organizationMembers.pending.dialogTitle': 'Révoquer l’invitation de {email} ?',
  'organizationMembers.pending.dialogDescription': 'Le lien d’invitation cessera immédiatement de fonctionner.',
  'organizationMembers.pending.dialogConfirm': 'Révoquer l’invitation',
};

export function getOrganizationMembersCopy(language?: string | null): OrganizationMembersCopy {
  return resolveMarketingLanguage(language) === 'fr' ? organizationMembersFr : organizationMembersEn;
}

export function formatOrganizationMembersCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function resolveOrganizationMembersLanguage(language?: string | null): MarketingLanguage {
  return resolveMarketingLanguage(language);
}

export function organizationMemberRoleLabel(
  roleKey: string,
  customName: string | undefined,
  copy: OrganizationMembersCopy,
): string {
  const knownRoles: Readonly<Record<string, OrganizationMembersKey>> = {
    viewer: 'organizationMembers.role.viewer',
    member: 'organizationMembers.role.member',
    admin: 'organizationMembers.role.admin',
    owner: 'organizationMembers.role.owner',
  };

  const key = knownRoles[roleKey.trim().toLowerCase()];

  return key ? copy[key] : customName?.trim() || roleKey || copy['organizationMembers.role.member'];
}
