export type AdminSupportTicketsLanguage = 'en' | 'fr';

export const adminSupportTicketsEn = {
  'adminSupportTickets.loading': 'Loading support tickets',
  'adminSupportTickets.error.title': 'Support tickets could not load',
  'adminSupportTickets.error.description':
    'The ticket list is temporarily unavailable. No ticket data or administrator credentials were changed.',
  'adminSupportTickets.error.retry': 'Reload support tickets',
  'adminSupportTickets.error.retrying': 'Reloading support tickets…',
  'adminSupportTickets.empty.title': 'No support tickets',
  'adminSupportTickets.empty.description': 'New customer requests will appear here when they are submitted.',
  'adminSupportTickets.count_one': '{count} support ticket',
  'adminSupportTickets.count_other': '{count} support tickets',
  'adminSupportTickets.table.caption': 'Support tickets, response deadlines, assignees and actions',
  'adminSupportTickets.table.scrollLabel': 'Scrollable support tickets table',
  'adminSupportTickets.reauth.title': 'Confirm changes with your password',
  'adminSupportTickets.reauth.description':
    'Responding to or assigning a ticket is protected by step-up authentication. Enter your password once, then act on the tickets below. It is sent only with the action and is never stored.',
  'adminSupportTickets.reauth.passwordLabel': 'Administrator password',
  'adminSupportTickets.reauth.passwordPlaceholder': 'Your password',
  'adminSupportTickets.column.subject': 'Subject',
  'adminSupportTickets.column.status': 'Status',
  'adminSupportTickets.column.created': 'Created',
  'adminSupportTickets.column.due': 'First response due',
  'adminSupportTickets.column.assignee': 'Assignee',
  'adminSupportTickets.column.actions': 'Actions',
  'adminSupportTickets.sortBy': 'Sort by {column}',
  'adminSupportTickets.status.open': 'Open',
  'adminSupportTickets.status.pending': 'Pending',
  'adminSupportTickets.status.resolved': 'Resolved',
  'adminSupportTickets.status.closed': 'Closed',
  'adminSupportTickets.status.unknown': 'Unknown',
  'adminSupportTickets.dateUnavailable': 'Date unavailable',
  'adminSupportTickets.sla.unavailable': 'Response deadline unavailable',
  'adminSupportTickets.sla.responded': 'Responded',
  'adminSupportTickets.sla.overdue': 'Overdue',
  'adminSupportTickets.sla.due': 'Due',
  'adminSupportTickets.sla.plan': '{plan} SLA',
  'adminSupportTickets.organizationIdentifier': 'organization {id}',
  'adminSupportTickets.userIdentifier': 'user {id}',
  'adminSupportTickets.assigneeFor': 'Assignee for ticket {subject}',
  'adminSupportTickets.assignee.unassigned': 'Unassigned',
  'adminSupportTickets.assignee.assigning': 'Updating assignee…',
  'adminSupportTickets.action.respond': 'Respond',
  'adminSupportTickets.action.close': 'Close',
  'adminSupportTickets.form.newStatus': 'New status',
  'adminSupportTickets.form.response': 'Response',
  'adminSupportTickets.form.responsePlaceholder': 'Write your response to the customer…',
  'adminSupportTickets.form.sending': 'Sending…',
  'adminSupportTickets.form.sendResponse': 'Send response',
  'adminSupportTickets.form.passwordFirst': 'Enter your password above first.',
  'adminSupportTickets.feedback.assignmentSuccess': 'Ticket assignment updated.',
  'adminSupportTickets.feedback.assignmentError':
    'The ticket assignment could not be updated. Check your access and try again.',
  'adminSupportTickets.feedback.responseSuccess': 'Response sent and ticket status updated.',
  'adminSupportTickets.feedback.responseError': 'The response could not be sent. Check your access and try again.',
} as const;

export type AdminSupportTicketsCopy = { [Key in keyof typeof adminSupportTicketsEn]: string };

export const adminSupportTicketsFr: AdminSupportTicketsCopy = {
  'adminSupportTickets.loading': 'Chargement des tickets d’assistance',
  'adminSupportTickets.error.title': 'Impossible de charger les tickets d’assistance',
  'adminSupportTickets.error.description':
    'La liste des tickets est temporairement indisponible. Aucune donnée de ticket ni aucun identifiant administrateur n’a été modifié.',
  'adminSupportTickets.error.retry': 'Recharger les tickets d’assistance',
  'adminSupportTickets.error.retrying': 'Rechargement des tickets d’assistance…',
  'adminSupportTickets.empty.title': 'Aucun ticket d’assistance',
  'adminSupportTickets.empty.description': 'Les nouvelles demandes des clients apparaîtront ici dès leur envoi.',
  'adminSupportTickets.count_one': '{count} ticket d’assistance',
  'adminSupportTickets.count_other': '{count} tickets d’assistance',
  'adminSupportTickets.table.caption': 'Tickets d’assistance, échéances de réponse, responsables et actions',
  'adminSupportTickets.table.scrollLabel': 'Tableau défilant des tickets d’assistance',
  'adminSupportTickets.reauth.title': 'Confirmez les modifications avec votre mot de passe',
  'adminSupportTickets.reauth.description':
    'La réponse à un ticket et son attribution sont protégées par une authentification renforcée. Saisissez votre mot de passe une fois, puis intervenez sur les tickets ci-dessous. Il est envoyé uniquement avec l’action et n’est jamais conservé.',
  'adminSupportTickets.reauth.passwordLabel': 'Mot de passe administrateur',
  'adminSupportTickets.reauth.passwordPlaceholder': 'Votre mot de passe',
  'adminSupportTickets.column.subject': 'Objet',
  'adminSupportTickets.column.status': 'État',
  'adminSupportTickets.column.created': 'Créé',
  'adminSupportTickets.column.due': 'Échéance de première réponse',
  'adminSupportTickets.column.assignee': 'Responsable',
  'adminSupportTickets.column.actions': 'Actions',
  'adminSupportTickets.sortBy': 'Trier par {column}',
  'adminSupportTickets.status.open': 'Ouvert',
  'adminSupportTickets.status.pending': 'En attente',
  'adminSupportTickets.status.resolved': 'Résolu',
  'adminSupportTickets.status.closed': 'Fermé',
  'adminSupportTickets.status.unknown': 'Inconnu',
  'adminSupportTickets.dateUnavailable': 'Date indisponible',
  'adminSupportTickets.sla.unavailable': 'Échéance de réponse indisponible',
  'adminSupportTickets.sla.responded': 'Réponse envoyée',
  'adminSupportTickets.sla.overdue': 'En retard',
  'adminSupportTickets.sla.due': 'Échéance',
  'adminSupportTickets.sla.plan': 'SLA {plan}',
  'adminSupportTickets.organizationIdentifier': 'organisation {id}',
  'adminSupportTickets.userIdentifier': 'utilisateur {id}',
  'adminSupportTickets.assigneeFor': 'Responsable du ticket {subject}',
  'adminSupportTickets.assignee.unassigned': 'Non attribué',
  'adminSupportTickets.assignee.assigning': 'Mise à jour du responsable…',
  'adminSupportTickets.action.respond': 'Répondre',
  'adminSupportTickets.action.close': 'Fermer',
  'adminSupportTickets.form.newStatus': 'Nouvel état',
  'adminSupportTickets.form.response': 'Réponse',
  'adminSupportTickets.form.responsePlaceholder': 'Rédigez votre réponse au client…',
  'adminSupportTickets.form.sending': 'Envoi…',
  'adminSupportTickets.form.sendResponse': 'Envoyer la réponse',
  'adminSupportTickets.form.passwordFirst': 'Saisissez d’abord votre mot de passe ci-dessus.',
  'adminSupportTickets.feedback.assignmentSuccess': 'Attribution du ticket mise à jour.',
  'adminSupportTickets.feedback.assignmentError':
    'Impossible de modifier l’attribution du ticket. Vérifiez vos droits, puis réessayez.',
  'adminSupportTickets.feedback.responseSuccess': 'Réponse envoyée et état du ticket mis à jour.',
  'adminSupportTickets.feedback.responseError': 'Impossible d’envoyer la réponse. Vérifiez vos droits, puis réessayez.',
};

export function resolveAdminSupportTicketsLanguage(language?: string | null): AdminSupportTicketsLanguage {
  return language?.trim().toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function getAdminSupportTicketsCopy(language?: string | null): AdminSupportTicketsCopy {
  return resolveAdminSupportTicketsLanguage(language) === 'fr' ? adminSupportTicketsFr : adminSupportTicketsEn;
}

export function interpolateAdminSupportTicketsCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatAdminSupportTicketsNumber(value: number, language?: string | null): string {
  return new Intl.NumberFormat(resolveAdminSupportTicketsLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatAdminSupportTicketsPlural(
  count: number,
  language: string | null | undefined,
  forms: { one: string; other: string },
): string {
  const locale = resolveAdminSupportTicketsLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
  const form = new Intl.PluralRules(locale).select(count) === 'one' ? forms.one : forms.other;

  return interpolateAdminSupportTicketsCopy(form, {
    count: formatAdminSupportTicketsNumber(count, language),
  });
}

export function formatAdminSupportTicketsDateTime(value: string | number | Date, language?: string | null): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return getAdminSupportTicketsCopy(language)['adminSupportTickets.dateUnavailable'];
  }

  return new Intl.DateTimeFormat(resolveAdminSupportTicketsLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatAdminSupportTicketsDueDelta(dueMs: number, nowMs: number, language?: string | null): string {
  if (!Number.isFinite(dueMs) || !Number.isFinite(nowMs)) {
    return getAdminSupportTicketsCopy(language)['adminSupportTickets.sla.unavailable'];
  }

  const formatter = new Intl.RelativeTimeFormat(
    resolveAdminSupportTicketsLanguage(language) === 'fr' ? 'fr-FR' : 'en-US',
    { numeric: 'always' },
  );

  const deltaMs = dueMs - nowMs;
  const absoluteMs = Math.abs(deltaMs);

  if (absoluteMs < 60_000) {
    return formatter.format(Math.sign(deltaMs) || 1, 'minute');
  }

  if (absoluteMs < 60 * 60_000) {
    return formatter.format(Math.round(deltaMs / 60_000), 'minute');
  }

  if (absoluteMs < 24 * 60 * 60_000) {
    return formatter.format(Math.round(deltaMs / (60 * 60_000)), 'hour');
  }

  return formatter.format(Math.round(deltaMs / (24 * 60 * 60_000)), 'day');
}

export function adminSupportTicketStatusLabel(status: string | null | undefined, language?: string | null): string {
  const copy = getAdminSupportTicketsCopy(language);

  switch (status?.trim().toUpperCase()) {
    case 'OPEN':
      return copy['adminSupportTickets.status.open'];
    case 'PENDING':
      return copy['adminSupportTickets.status.pending'];
    case 'RESOLVED':
      return copy['adminSupportTickets.status.resolved'];
    case 'CLOSED':
      return copy['adminSupportTickets.status.closed'];
    default:
      return copy['adminSupportTickets.status.unknown'];
  }
}

export type AdminSupportTicketFeedback = { tone: 'success' | 'error'; message: string };

export function adminSupportTicketActionFeedback(
  data: unknown,
  operation: 'assignment' | 'response',
  language?: string | null,
): AdminSupportTicketFeedback | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const record = data as { ok?: unknown; error?: unknown };
  const copy = getAdminSupportTicketsCopy(language);

  if (record.ok === true) {
    return {
      tone: 'success',
      message:
        operation === 'assignment'
          ? copy['adminSupportTickets.feedback.assignmentSuccess']
          : copy['adminSupportTickets.feedback.responseSuccess'],
    };
  }

  if (record.ok === false || record.error !== undefined) {
    return {
      tone: 'error',
      message:
        operation === 'assignment'
          ? copy['adminSupportTickets.feedback.assignmentError']
          : copy['adminSupportTickets.feedback.responseError'],
    };
  }

  return null;
}
