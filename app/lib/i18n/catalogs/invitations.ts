export type InvitationsLanguage = 'en' | 'fr';

export const invitationsEn = {
  'invitations.meta.title': 'Invitations - E-Code',
  'invitations.meta.description': 'Invite teammates and manage access to your E-Code organization.',
  'invitations.page.title': 'Invitations',
  'invitations.page.description': 'Invite teammates and assign the right level of access.',
  'invitations.load.loading': 'Loading invitations',
  'invitations.load.error.title': 'Invitations could not load',
  'invitations.load.error.description':
    'Invitation data is temporarily unavailable. No invitation or access setting was changed.',
  'invitations.load.permission.title': 'Invitation access is restricted',
  'invitations.load.permission.description':
    'Only organization owners and members with permission to manage members can view or change invitations.',
  'invitations.load.retry': 'Reload invitations',
  'invitations.routeError.organization.title': 'No organization is available',
  'invitations.routeError.organization.description': 'Create or join an organization before managing team invitations.',
  'invitations.routeError.authentication.title': 'Sign in again to manage invitations',
  'invitations.routeError.authentication.description':
    'Your session is no longer active. Sign in again, then return to invitations.',
  'invitations.routeError.permission.title': 'You cannot manage these invitations',
  'invitations.routeError.permission.description':
    'Your current organization role does not include permission to manage members.',
  'invitations.routeError.unavailable.title': 'Invitations are temporarily unavailable',
  'invitations.routeError.unavailable.description':
    'The invitations page could not be opened. Your existing invitations were not changed.',
  'invitations.routeError.backDashboard': 'Back to dashboard',
  'invitations.routeError.signIn': 'Sign in',
  'invitations.feedback.created': 'Invitation created.',
  'invitations.feedback.resent': 'Invitation resent.',
  'invitations.feedback.expired': 'Invitation expired.',
  'invitations.error.organizationUnavailable': 'Your organization is unavailable. Reload the page and try again.',
  'invitations.error.invitationRequired': 'Choose an invitation and try again.',
  'invitations.error.emailRequired': 'Enter an email address.',
  'invitations.error.invalidAction': 'Choose a valid invitation action.',
  'invitations.error.permission': 'You cannot manage invitations for this organization.',
  'invitations.error.notFound': 'This invitation is no longer available. Reload the page and try again.',
  'invitations.error.conflict': 'This invitation changed before the action completed. Reload and try again.',
  'invitations.error.rateLimited': 'Too many invitation requests were sent. Wait a moment and try again.',
  'invitations.error.rejected': 'The invitation action could not be completed. Review the details and try again.',
  'invitations.error.unavailable': 'The invitation service is temporarily unavailable. Try again shortly.',
  'invitations.form.title': 'Create an invitation',
  'invitations.form.description': 'The recipient will receive a secure invitation link by email.',
  'invitations.form.email': 'Email',
  'invitations.form.emailPlaceholder': 'person@company.com',
  'invitations.form.role': 'Role',
  'invitations.form.create': 'Create invitation',
  'invitations.form.creating': 'Creating invitation…',
  'invitations.list.title': 'Organization invitations',
  'invitations.list.description': 'Review access, resend a fresh link or expire a link immediately.',
  'invitations.list.count_one': '{count} invitation',
  'invitations.list.count_other': '{count} invitations',
  'invitations.list.empty.title': 'No invitations yet',
  'invitations.list.empty.description': 'Create an invitation above to add a teammate to your organization.',
  'invitations.invitation.expires': 'Expires {date}',
  'invitations.invitation.dateUnavailable': 'Expiration date unavailable',
  'invitations.invitation.status.accepted': 'Accepted',
  'invitations.invitation.status.expired': 'Expired',
  'invitations.invitation.status.pending': 'Pending',
  'invitations.action.resend': 'Resend',
  'invitations.action.resending': 'Resending…',
  'invitations.action.resendAria': 'Resend the invitation to {email}',
  'invitations.action.expire': 'Expire',
  'invitations.action.expiring': 'Expiring…',
  'invitations.action.expireAria': 'Expire the invitation for {email}',
  'invitations.dialog.title': 'Expire the invitation for {email}?',
  'invitations.dialog.description': 'The recipient will no longer be able to use this invitation link.',
  'invitations.dialog.confirm': 'Expire invitation',
  'invitations.dialog.confirming': 'Expiring invitation…',
  'invitations.dialog.cancel': 'Cancel',
  'invitations.role.viewer': 'Viewer',
  'invitations.role.member': 'Member',
  'invitations.role.editor': 'Editor',
  'invitations.role.admin': 'Admin',
  'invitations.role.owner': 'Owner',
  'invitations.accept.meta.title': 'Accept an invitation - E-Code',
  'invitations.accept.meta.description': 'Accept a secure invitation to join an E-Code organization.',
  'invitations.accept.page.title': 'Accept invitation',
  'invitations.accept.page.description': 'Join an organization with a pending invitation token.',
  'invitations.accept.form.token': 'Invitation token',
  'invitations.accept.form.submit': 'Accept invitation',
  'invitations.accept.form.submitting': 'Accepting invitation…',
  'invitations.accept.feedback.accepted': 'Invitation accepted. Your access level is now {role}.',
  'invitations.accept.role.fallback': 'organization member',
  'invitations.accept.error.tokenRequired': 'Enter the invitation token before continuing.',
  'invitations.accept.error.invalid': 'This invitation is invalid, expired, or has already been used.',
  'invitations.accept.error.rateLimited': 'Too many attempts were made. Wait a moment, then try again.',
  'invitations.accept.error.unavailable': 'Invitations are temporarily unavailable. Try again shortly.',
} as const;

export type InvitationsCopy = { [Key in keyof typeof invitationsEn]: string };

export const invitationsFr: InvitationsCopy = {
  'invitations.meta.title': 'Invitations - E-Code',
  'invitations.meta.description': 'Invitez vos collègues et gérez leur accès à votre organisation E-Code.',
  'invitations.page.title': 'Invitations',
  'invitations.page.description': 'Invitez vos collègues et attribuez-leur le niveau d’accès adapté.',
  'invitations.load.loading': 'Chargement des invitations',
  'invitations.load.error.title': 'Impossible de charger les invitations',
  'invitations.load.error.description':
    'Les données des invitations sont temporairement indisponibles. Aucune invitation ni aucun droit d’accès n’a été modifié.',
  'invitations.load.permission.title': 'Accès aux invitations restreint',
  'invitations.load.permission.description':
    'Seuls les propriétaires de l’organisation et les membres autorisés à gérer les membres peuvent consulter ou modifier les invitations.',
  'invitations.load.retry': 'Recharger les invitations',
  'invitations.routeError.organization.title': 'Aucune organisation disponible',
  'invitations.routeError.organization.description':
    'Créez ou rejoignez une organisation avant de gérer les invitations de l’équipe.',
  'invitations.routeError.authentication.title': 'Reconnectez-vous pour gérer les invitations',
  'invitations.routeError.authentication.description':
    'Votre session n’est plus active. Reconnectez-vous, puis revenez aux invitations.',
  'invitations.routeError.permission.title': 'Vous ne pouvez pas gérer ces invitations',
  'invitations.routeError.permission.description':
    'Votre rôle actuel dans l’organisation ne permet pas de gérer les membres.',
  'invitations.routeError.unavailable.title': 'Invitations temporairement indisponibles',
  'invitations.routeError.unavailable.description':
    'Impossible d’ouvrir la page des invitations. Vos invitations existantes n’ont pas été modifiées.',
  'invitations.routeError.backDashboard': 'Retour au tableau de bord',
  'invitations.routeError.signIn': 'Se connecter',
  'invitations.feedback.created': 'Invitation créée.',
  'invitations.feedback.resent': 'Invitation renvoyée.',
  'invitations.feedback.expired': 'Invitation expirée.',
  'invitations.error.organizationUnavailable':
    'Votre organisation est indisponible. Rechargez la page, puis réessayez.',
  'invitations.error.invitationRequired': 'Sélectionnez une invitation, puis réessayez.',
  'invitations.error.emailRequired': 'Saisissez une adresse e-mail.',
  'invitations.error.invalidAction': 'Sélectionnez une action valide pour l’invitation.',
  'invitations.error.permission': 'Vous ne pouvez pas gérer les invitations de cette organisation.',
  'invitations.error.notFound': 'Cette invitation n’est plus disponible. Rechargez la page, puis réessayez.',
  'invitations.error.conflict':
    'Cette invitation a changé avant la fin de l’action. Rechargez la page, puis réessayez.',
  'invitations.error.rateLimited':
    'Trop de demandes d’invitation ont été envoyées. Patientez un instant, puis réessayez.',
  'invitations.error.rejected':
    'Impossible d’effectuer l’action sur l’invitation. Vérifiez les informations, puis réessayez.',
  'invitations.error.unavailable':
    'Le service d’invitation est temporairement indisponible. Réessayez dans quelques instants.',
  'invitations.form.title': 'Créer une invitation',
  'invitations.form.description': 'Le destinataire recevra un lien d’invitation sécurisé par e-mail.',
  'invitations.form.email': 'E-mail',
  'invitations.form.emailPlaceholder': 'personne@entreprise.fr',
  'invitations.form.role': 'Rôle',
  'invitations.form.create': 'Créer l’invitation',
  'invitations.form.creating': 'Création de l’invitation…',
  'invitations.list.title': 'Invitations de l’organisation',
  'invitations.list.description':
    'Vérifiez les accès, renvoyez un nouveau lien ou faites expirer un lien immédiatement.',
  'invitations.list.count_one': '{count} invitation',
  'invitations.list.count_other': '{count} invitations',
  'invitations.list.empty.title': 'Aucune invitation pour le moment',
  'invitations.list.empty.description': 'Créez une invitation ci-dessus pour ajouter un collègue à votre organisation.',
  'invitations.invitation.expires': 'Expire le {date}',
  'invitations.invitation.dateUnavailable': 'Date d’expiration indisponible',
  'invitations.invitation.status.accepted': 'Acceptée',
  'invitations.invitation.status.expired': 'Expirée',
  'invitations.invitation.status.pending': 'En attente',
  'invitations.action.resend': 'Renvoyer',
  'invitations.action.resending': 'Renvoi…',
  'invitations.action.resendAria': 'Renvoyer l’invitation à {email}',
  'invitations.action.expire': 'Faire expirer',
  'invitations.action.expiring': 'Expiration…',
  'invitations.action.expireAria': 'Faire expirer l’invitation de {email}',
  'invitations.dialog.title': 'Faire expirer l’invitation de {email} ?',
  'invitations.dialog.description': 'Le destinataire ne pourra plus utiliser ce lien d’invitation.',
  'invitations.dialog.confirm': 'Faire expirer l’invitation',
  'invitations.dialog.confirming': 'Expiration de l’invitation…',
  'invitations.dialog.cancel': 'Annuler',
  'invitations.role.viewer': 'Lecteur',
  'invitations.role.member': 'Membre',
  'invitations.role.editor': 'Éditeur',
  'invitations.role.admin': 'Administrateur',
  'invitations.role.owner': 'Propriétaire',
  'invitations.accept.meta.title': 'Accepter une invitation - E-Code',
  'invitations.accept.meta.description': 'Acceptez une invitation sécurisée pour rejoindre une organisation E-Code.',
  'invitations.accept.page.title': 'Accepter l’invitation',
  'invitations.accept.page.description': 'Rejoignez une organisation à l’aide d’un jeton d’invitation en attente.',
  'invitations.accept.form.token': 'Jeton d’invitation',
  'invitations.accept.form.submit': 'Accepter l’invitation',
  'invitations.accept.form.submitting': 'Acceptation de l’invitation…',
  'invitations.accept.feedback.accepted': 'Invitation acceptée. Votre niveau d’accès est désormais : {role}.',
  'invitations.accept.role.fallback': 'membre de l’organisation',
  'invitations.accept.error.tokenRequired': 'Saisissez le jeton d’invitation avant de continuer.',
  'invitations.accept.error.invalid': 'Cette invitation est invalide, expirée ou a déjà été utilisée.',
  'invitations.accept.error.rateLimited':
    'Trop de tentatives ont été effectuées. Patientez un instant, puis réessayez.',
  'invitations.accept.error.unavailable':
    'Les invitations sont temporairement indisponibles. Réessayez dans quelques instants.',
};

export type InvitationActionStatusCode = 'created' | 'resent' | 'expired';

export type InvitationActionErrorCode =
  | 'organizationUnavailable'
  | 'invitationRequired'
  | 'emailRequired'
  | 'invalidAction'
  | 'permission'
  | 'notFound'
  | 'conflict'
  | 'rateLimited'
  | 'rejected'
  | 'unavailable';

export type InvitationsRouteErrorKind = 'organization' | 'authentication' | 'permission' | 'unavailable';

export type InvitationRoleOption = Readonly<{ key: string; name: string; system?: boolean }>;

export function resolveInvitationsLanguage(language?: string | null): InvitationsLanguage {
  return language?.trim().toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function getInvitationsCopy(language?: string | null): InvitationsCopy {
  return resolveInvitationsLanguage(language) === 'fr' ? invitationsFr : invitationsEn;
}

export function interpolateInvitationsCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatInvitationsNumber(value: number, language?: string | null): string {
  const locale = resolveInvitationsLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';

  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

export function formatInvitationsPlural(
  count: number,
  language: string | null | undefined,
  forms: Readonly<{ one: string; other: string }>,
): string {
  const locale = resolveInvitationsLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
  const form = new Intl.PluralRules(locale).select(count) === 'one' ? forms.one : forms.other;

  return interpolateInvitationsCopy(form, { count: formatInvitationsNumber(count, language) });
}

export function formatInvitationsDateTime(value: string | number | Date, language?: string | null): string {
  const date = new Date(value);
  const copy = getInvitationsCopy(language);

  if (Number.isNaN(date.getTime())) {
    return copy['invitations.invitation.dateUnavailable'];
  }

  return new Intl.DateTimeFormat(resolveInvitationsLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(date);
}

function builtInInvitationRoleLabel(roleKey: string, copy: InvitationsCopy): string | undefined {
  switch (roleKey.trim().toLowerCase()) {
    case 'viewer':
      return copy['invitations.role.viewer'];
    case 'member':
      return copy['invitations.role.member'];
    case 'editor':
      return copy['invitations.role.editor'];
    case 'admin':
      return copy['invitations.role.admin'];
    case 'owner':
      return copy['invitations.role.owner'];
    default:
      return undefined;
  }
}

export function invitationRoleLabel(
  roleKey: string,
  roles: readonly InvitationRoleOption[],
  language?: string | null,
): string {
  const systemLabel = builtInInvitationRoleLabel(roleKey, getInvitationsCopy(language));

  if (systemLabel) {
    return systemLabel;
  }

  const customRole = roles.find((role) => role.key === roleKey && role.system !== true);

  return customRole?.name.trim() || roleKey;
}

export function invitationActionStatusMessage(
  code: InvitationActionStatusCode | null | undefined,
  language?: string | null,
): string | null {
  const copy = getInvitationsCopy(language);

  switch (code) {
    case 'created':
      return copy['invitations.feedback.created'];
    case 'resent':
      return copy['invitations.feedback.resent'];
    case 'expired':
      return copy['invitations.feedback.expired'];
    default:
      return null;
  }
}

export function invitationActionErrorMessage(
  code: InvitationActionErrorCode | null | undefined,
  language?: string | null,
): string | null {
  if (!code) {
    return null;
  }

  const copy = getInvitationsCopy(language);

  switch (code) {
    case 'organizationUnavailable':
      return copy['invitations.error.organizationUnavailable'];
    case 'invitationRequired':
      return copy['invitations.error.invitationRequired'];
    case 'emailRequired':
      return copy['invitations.error.emailRequired'];
    case 'invalidAction':
      return copy['invitations.error.invalidAction'];
    case 'permission':
      return copy['invitations.error.permission'];
    case 'notFound':
      return copy['invitations.error.notFound'];
    case 'conflict':
      return copy['invitations.error.conflict'];
    case 'rateLimited':
      return copy['invitations.error.rateLimited'];
    case 'rejected':
      return copy['invitations.error.rejected'];
    case 'unavailable':
    default:
      return copy['invitations.error.unavailable'];
  }
}

export function invitationsRouteErrorKind(error: unknown): InvitationsRouteErrorKind {
  const status =
    error instanceof Response
      ? error.status
      : error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
        ? error.status
        : null;

  if (status === 400) {
    return 'organization';
  }

  if (status === 401) {
    return 'authentication';
  }

  if (status === 403) {
    return 'permission';
  }

  return 'unavailable';
}
