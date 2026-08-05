import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';
import { formatUserAreaNumber } from '~/lib/i18n/user-area-locale';

export const supportTicketDetailEn = {
  'supportTicketDetail.meta.title': 'Support request — E-Code',
  'supportTicketDetail.meta.description': 'Review and reply to your private E-Code support conversation.',
  'supportTicketDetail.shell.title': 'Support request',
  'supportTicketDetail.shell.description': 'Review the conversation and reply to your support request.',
  'supportTicketDetail.back': 'Back to support',
  'supportTicketDetail.load.loading': 'Loading support conversation',
  'supportTicketDetail.load.retry': 'Reload conversation',
  'supportTicketDetail.load.notFound.title': 'Support request not found',
  'supportTicketDetail.load.notFound.description':
    'This request no longer exists or is not available to your organization.',
  'supportTicketDetail.load.forbidden.title': 'Access to this request is restricted',
  'supportTicketDetail.load.forbidden.description': 'You do not have permission to view this support conversation.',
  'supportTicketDetail.load.rateLimited.title': 'Support is receiving too many requests',
  'supportTicketDetail.load.rateLimited.description': 'Wait a moment, then reload the conversation.',
  'supportTicketDetail.load.unavailable.title': 'Support conversation could not load',
  'supportTicketDetail.load.unavailable.description':
    'The conversation is temporarily unavailable. No message was changed.',
  'supportTicketDetail.ticket.openedPrefix': 'Opened',
  'supportTicketDetail.ticket.recorded': 'Recorded',
  'supportTicketDetail.ticket.category.runtime': 'Runtime and workspaces',
  'supportTicketDetail.ticket.category.billing': 'Billing and plans',
  'supportTicketDetail.ticket.category.security': 'Security',
  'supportTicketDetail.ticket.category.account': 'Account and access',
  'supportTicketDetail.ticket.category.other': 'Other request',
  'supportTicketDetail.ticket.status.open': 'Open',
  'supportTicketDetail.ticket.status.pending': 'Pending',
  'supportTicketDetail.ticket.status.resolved': 'Resolved',
  'supportTicketDetail.ticket.status.closed': 'Closed',
  'supportTicketDetail.ticket.status.unavailable': 'Status unavailable',
  'supportTicketDetail.conversation.title': 'Conversation',
  'supportTicketDetail.conversation.count.one': '{count} message',
  'supportTicketDetail.conversation.count.other': '{count} messages',
  'supportTicketDetail.conversation.empty.title': 'No replies yet',
  'supportTicketDetail.conversation.empty.description':
    'Add a message below and the E-Code support team will follow up.',
  'supportTicketDetail.author.user': 'You',
  'supportTicketDetail.author.admin': 'E-Code Support',
  'supportTicketDetail.author.system': 'System',
  'supportTicketDetail.author.unavailable': 'Participant',
  'supportTicketDetail.reply.label': 'Your message',
  'supportTicketDetail.reply.placeholder': 'Add a reply…',
  'supportTicketDetail.reply.characterCount': '{current} / {maximum} characters',
  'supportTicketDetail.reply.submit': 'Send message',
  'supportTicketDetail.reply.submitting': 'Sending message…',
  'supportTicketDetail.reply.closed.title': 'This request is closed',
  'supportTicketDetail.reply.closed.description': 'Open a new support request if you still need help.',
  'supportTicketDetail.reply.closed.action': 'Open a new request',
  'supportTicketDetail.error.messageRequired': 'Write a message before sending.',
  'supportTicketDetail.error.messageTooLong': 'Keep your message within {maximum} characters.',
  'supportTicketDetail.error.ticketClosed': 'This request is closed and cannot receive new messages.',
  'supportTicketDetail.error.notFound': 'This support request could not be found.',
  'supportTicketDetail.error.forbidden': 'You cannot reply to this support request.',
  'supportTicketDetail.error.rateLimited': 'Too many replies were sent. Wait a moment, then try again.',
  'supportTicketDetail.error.rejected': 'Your message was not accepted. Check it and try again.',
  'supportTicketDetail.error.unavailable': 'Your message could not be sent. Try again later.',
} as const;

export type SupportTicketDetailKey = keyof typeof supportTicketDetailEn;
export type SupportTicketDetailCopy = Readonly<Record<SupportTicketDetailKey, string>>;
export type SupportTicketDetailLanguage = MarketingLanguage;
export type SupportTicketDetailLoadErrorCode = 'notFound' | 'forbidden' | 'rateLimited' | 'unavailable';
export type SupportTicketDetailActionErrorCode =
  | 'messageRequired'
  | 'messageTooLong'
  | 'ticketClosed'
  | 'notFound'
  | 'forbidden'
  | 'rateLimited'
  | 'rejected'
  | 'unavailable';

export const supportTicketDetailFr: SupportTicketDetailCopy = {
  'supportTicketDetail.meta.title': 'Demande d’assistance — E-Code',
  'supportTicketDetail.meta.description': 'Consultez votre conversation privée avec l’assistance E-Code et répondez-y.',
  'supportTicketDetail.shell.title': 'Demande d’assistance',
  'supportTicketDetail.shell.description': 'Consultez la conversation et répondez à votre demande d’assistance.',
  'supportTicketDetail.back': 'Retour à l’assistance',
  'supportTicketDetail.load.loading': 'Chargement de la conversation d’assistance',
  'supportTicketDetail.load.retry': 'Recharger la conversation',
  'supportTicketDetail.load.notFound.title': 'Demande d’assistance introuvable',
  'supportTicketDetail.load.notFound.description':
    'Cette demande n’existe plus ou n’est pas accessible à votre organisation.',
  'supportTicketDetail.load.forbidden.title': 'Accès à cette demande restreint',
  'supportTicketDetail.load.forbidden.description':
    'Vous n’avez pas l’autorisation de consulter cette conversation d’assistance.',
  'supportTicketDetail.load.rateLimited.title': 'L’assistance reçoit trop de requêtes',
  'supportTicketDetail.load.rateLimited.description': 'Patientez un instant, puis rechargez la conversation.',
  'supportTicketDetail.load.unavailable.title': 'Impossible de charger la conversation d’assistance',
  'supportTicketDetail.load.unavailable.description':
    'La conversation est temporairement indisponible. Aucun message n’a été modifié.',
  'supportTicketDetail.ticket.openedPrefix': 'Ouverte',
  'supportTicketDetail.ticket.recorded': 'Enregistrée',
  'supportTicketDetail.ticket.category.runtime': 'Environnement d’exécution et espaces de travail',
  'supportTicketDetail.ticket.category.billing': 'Facturation et forfaits',
  'supportTicketDetail.ticket.category.security': 'Sécurité',
  'supportTicketDetail.ticket.category.account': 'Compte et accès',
  'supportTicketDetail.ticket.category.other': 'Autre demande',
  'supportTicketDetail.ticket.status.open': 'Ouverte',
  'supportTicketDetail.ticket.status.pending': 'En attente',
  'supportTicketDetail.ticket.status.resolved': 'Résolue',
  'supportTicketDetail.ticket.status.closed': 'Fermée',
  'supportTicketDetail.ticket.status.unavailable': 'État indisponible',
  'supportTicketDetail.conversation.title': 'Conversation',
  'supportTicketDetail.conversation.count.one': '{count} message',
  'supportTicketDetail.conversation.count.other': '{count} messages',
  'supportTicketDetail.conversation.empty.title': 'Aucune réponse pour le moment',
  'supportTicketDetail.conversation.empty.description':
    'Ajoutez un message ci-dessous ; l’équipe d’assistance E-Code vous répondra.',
  'supportTicketDetail.author.user': 'Vous',
  'supportTicketDetail.author.admin': 'Assistance E-Code',
  'supportTicketDetail.author.system': 'Système',
  'supportTicketDetail.author.unavailable': 'Intervenant',
  'supportTicketDetail.reply.label': 'Votre message',
  'supportTicketDetail.reply.placeholder': 'Ajouter une réponse…',
  'supportTicketDetail.reply.characterCount': '{current} / {maximum} caractères',
  'supportTicketDetail.reply.submit': 'Envoyer le message',
  'supportTicketDetail.reply.submitting': 'Envoi du message…',
  'supportTicketDetail.reply.closed.title': 'Cette demande est fermée',
  'supportTicketDetail.reply.closed.description':
    'Ouvrez une nouvelle demande d’assistance si vous avez encore besoin d’aide.',
  'supportTicketDetail.reply.closed.action': 'Ouvrir une nouvelle demande',
  'supportTicketDetail.error.messageRequired': 'Rédigez un message avant de l’envoyer.',
  'supportTicketDetail.error.messageTooLong': 'Limitez votre message à {maximum} caractères.',
  'supportTicketDetail.error.ticketClosed': 'Cette demande est fermée et ne peut plus recevoir de messages.',
  'supportTicketDetail.error.notFound': 'Cette demande d’assistance est introuvable.',
  'supportTicketDetail.error.forbidden': 'Vous ne pouvez pas répondre à cette demande d’assistance.',
  'supportTicketDetail.error.rateLimited': 'Trop de réponses ont été envoyées. Patientez un instant, puis réessayez.',
  'supportTicketDetail.error.rejected': 'Votre message n’a pas été accepté. Vérifiez-le, puis réessayez.',
  'supportTicketDetail.error.unavailable': 'Impossible d’envoyer votre message. Réessayez plus tard.',
};

const loadErrorKeys = {
  notFound: {
    title: 'supportTicketDetail.load.notFound.title',
    description: 'supportTicketDetail.load.notFound.description',
    retryable: false,
  },
  forbidden: {
    title: 'supportTicketDetail.load.forbidden.title',
    description: 'supportTicketDetail.load.forbidden.description',
    retryable: false,
  },
  rateLimited: {
    title: 'supportTicketDetail.load.rateLimited.title',
    description: 'supportTicketDetail.load.rateLimited.description',
    retryable: true,
  },
  unavailable: {
    title: 'supportTicketDetail.load.unavailable.title',
    description: 'supportTicketDetail.load.unavailable.description',
    retryable: true,
  },
} as const satisfies Record<
  SupportTicketDetailLoadErrorCode,
  { title: SupportTicketDetailKey; description: SupportTicketDetailKey; retryable: boolean }
>;

const actionErrorKeys = {
  messageRequired: 'supportTicketDetail.error.messageRequired',
  messageTooLong: 'supportTicketDetail.error.messageTooLong',
  ticketClosed: 'supportTicketDetail.error.ticketClosed',
  notFound: 'supportTicketDetail.error.notFound',
  forbidden: 'supportTicketDetail.error.forbidden',
  rateLimited: 'supportTicketDetail.error.rateLimited',
  rejected: 'supportTicketDetail.error.rejected',
  unavailable: 'supportTicketDetail.error.unavailable',
} as const satisfies Record<SupportTicketDetailActionErrorCode, SupportTicketDetailKey>;

const categoryKeys: Readonly<Record<string, SupportTicketDetailKey>> = {
  runtime: 'supportTicketDetail.ticket.category.runtime',
  billing: 'supportTicketDetail.ticket.category.billing',
  security: 'supportTicketDetail.ticket.category.security',
  account: 'supportTicketDetail.ticket.category.account',
  other: 'supportTicketDetail.ticket.category.other',
};

const statusKeys: Readonly<Record<string, SupportTicketDetailKey>> = {
  OPEN: 'supportTicketDetail.ticket.status.open',
  PENDING: 'supportTicketDetail.ticket.status.pending',
  RESOLVED: 'supportTicketDetail.ticket.status.resolved',
  CLOSED: 'supportTicketDetail.ticket.status.closed',
};

const authorKeys: Readonly<Record<string, SupportTicketDetailKey>> = {
  USER: 'supportTicketDetail.author.user',
  ADMIN: 'supportTicketDetail.author.admin',
  SYSTEM: 'supportTicketDetail.author.system',
};

export function resolveSupportTicketDetailLanguage(language?: string | null): SupportTicketDetailLanguage {
  return resolveMarketingLanguage(language);
}

export function getSupportTicketDetailCopy(language?: string | null): SupportTicketDetailCopy {
  return resolveSupportTicketDetailLanguage(language) === 'fr' ? supportTicketDetailFr : supportTicketDetailEn;
}

export function formatSupportTicketDetailCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatSupportTicketDetailNumber(value: number | bigint, language?: string | null): string {
  return formatUserAreaNumber(value, undefined, resolveSupportTicketDetailLanguage(language));
}

export function formatSupportTicketDetailMessageCount(count: number, language?: string | null): string {
  const copy = getSupportTicketDetailCopy(language);

  const key =
    count === 1 ? 'supportTicketDetail.conversation.count.one' : 'supportTicketDetail.conversation.count.other';

  return formatSupportTicketDetailCopy(copy[key], {
    count: formatSupportTicketDetailNumber(count, language),
  });
}

export function formatSupportTicketDetailCharacterCount(
  current: number,
  maximum: number,
  language?: string | null,
): string {
  const copy = getSupportTicketDetailCopy(language);

  return formatSupportTicketDetailCopy(copy['supportTicketDetail.reply.characterCount'], {
    current: formatSupportTicketDetailNumber(current, language),
    maximum: formatSupportTicketDetailNumber(maximum, language),
  });
}

export function supportTicketDetailCategoryLabel(category: string | undefined, language?: string | null): string {
  const copy = getSupportTicketDetailCopy(language);
  const key = category ? categoryKeys[category.trim().toLowerCase()] : undefined;

  return copy[key ?? 'supportTicketDetail.ticket.category.other'];
}

export function supportTicketDetailStatusLabel(status: string | undefined, language?: string | null): string {
  const copy = getSupportTicketDetailCopy(language);
  const key = status ? statusKeys[status.trim().toUpperCase()] : undefined;

  return copy[key ?? 'supportTicketDetail.ticket.status.unavailable'];
}

export function supportTicketDetailAuthorLabel(authorType: string | undefined, language?: string | null): string {
  const copy = getSupportTicketDetailCopy(language);
  const key = authorType ? authorKeys[authorType.trim().toUpperCase()] : undefined;

  return copy[key ?? 'supportTicketDetail.author.unavailable'];
}

export function supportTicketDetailLoadError(
  code: SupportTicketDetailLoadErrorCode,
  language?: string | null,
): { title: string; description: string; retryable: boolean } {
  const copy = getSupportTicketDetailCopy(language);
  const descriptor = loadErrorKeys[code];

  return {
    title: copy[descriptor.title],
    description: copy[descriptor.description],
    retryable: descriptor.retryable,
  };
}

export function supportTicketDetailActionError(
  code: SupportTicketDetailActionErrorCode | undefined,
  language?: string | null,
  maximum = 10_000,
): string | undefined {
  if (!code) {
    return undefined;
  }

  return formatSupportTicketDetailCopy(getSupportTicketDetailCopy(language)[actionErrorKeys[code]], {
    maximum: formatSupportTicketDetailNumber(maximum, language),
  });
}
