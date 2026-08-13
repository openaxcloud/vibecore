import { apiChatCatalog, type ApiChatCopyKey } from './api-chat';
import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const chatResidualsEn = {
  'chatResiduals.agentRepair.aria': 'Agent self-repair history',
  'chatResiduals.agentRepair.title': 'Self-repair history',
  'chatResiduals.agentRepair.outcome.repaired': 'Repaired',
  'chatResiduals.agentRepair.outcome.failed': 'Failed',
  'chatResiduals.agentRepair.outcome.gaveUp': 'Gave up',
  'chatResiduals.agentRepair.outcome.unknown': 'Unknown outcome',
  'chatResiduals.agentRepair.attempt_one': 'attempt {count}',
  'chatResiduals.agentRepair.attempt_other': 'attempt {count}',
  'chatResiduals.agentRepair.validationFailed': 'Code validation failed.',
  'chatResiduals.agentRepair.repairFailed': 'The automatic repair could not be applied.',
  'chatResiduals.agentRepair.location': ' Line {line}, column {column}.',
  'chatResiduals.agentRepair.dateUnavailable': 'Date unavailable',
  'chatResiduals.generate.title': 'This project has not been generated yet',
  'chatResiduals.generate.description':
    'The workspace only contains a README. Generate the app from your original prompt.',
  'chatResiduals.generate.action': 'Generate app',
  'chatResiduals.supabase.queryTitle': 'Supabase query',
  'chatResiduals.supabase.connectionTitle': 'Supabase connection required',
  'chatResiduals.supabase.queryDescription': 'Execute database query',
  'chatResiduals.supabase.connectionDescription': 'Supabase connection required',
  'chatResiduals.supabase.reviewMessage': 'Review the proposed changes before applying them to your database.',
  'chatResiduals.supabase.connectMessage': 'Connect Supabase to continue with this operation.',
  'chatResiduals.supabase.connectFirst': 'Connect Supabase and select a project first.',
  'chatResiduals.supabase.showQuery': 'Show the proposed database query',
  'chatResiduals.supabase.hideQuery': 'Hide the proposed database query',
  'chatResiduals.supabase.connect': 'Connect Supabase',
  'chatResiduals.supabase.apply': 'Apply changes',
  'chatResiduals.supabase.applying': 'Applying…',
  'chatResiduals.supabase.dismiss': 'Dismiss',
  'chatResiduals.supabase.executionFailed': 'The Supabase query could not be applied. Review the SQL and try again.',
  'chatResiduals.supabase.agentRetryMessage':
    'The Supabase query could not be applied. Review the SQL and return a corrected query.',
  'chatResiduals.export.trigger': 'Export',
  'chatResiduals.export.downloadCode': 'Download code',
  'chatResiduals.export.exportChat': 'Export conversation',
  'chatResiduals.code.copy': 'Copy code',
  'chatResiduals.code.copied': 'Copied',
  'chatResiduals.code.copyFailed': 'The code could not be copied. Try again.',
  'chatResiduals.code.highlightFailed': 'Syntax highlighting is unavailable. The code is shown as plain text.',
  'chatResiduals.mentions.aria': 'File mentions',
  'chatResiduals.mentions.empty': 'No matching files',
  'chatResiduals.markdown.thoughtProcess': 'Thought process',
  'chatResiduals.plan.aria': 'Plan checklist',
  'chatResiduals.plan.fallbackTitle': 'Plan',
  'chatResiduals.plan.progressAria': 'Plan progress',
  'chatResiduals.plan.progress': '{completed} / {total} complete',
  'chatResiduals.plan.failed_one': '{count} failed',
  'chatResiduals.plan.failed_other': '{count} failed',
  'chatResiduals.plan.status.pending': 'Pending',
  'chatResiduals.plan.status.inProgress': 'In progress',
  'chatResiduals.plan.status.completed': 'Done',
  'chatResiduals.plan.status.failed': 'Failed',
  'chatResiduals.plan.itemAria': '{description}, {status}',
  'chatResiduals.reconnection.reason.tokenExpired': 'The access token expired.',
  'chatResiduals.reconnection.reason.tokenRevoked': 'The token was revoked at the provider.',
  'chatResiduals.reconnection.reason.scopeInsufficient': 'The current scopes no longer cover the agent request.',
  'chatResiduals.reconnection.reason.generic': 'Reconnection is required to continue.',
  'chatResiduals.reconnection.success': '{provider} reconnected as {account}.',
  'chatResiduals.reconnection.title': 'Reconnect {provider}',
  'chatResiduals.reconnection.action': 'Reconnect {provider}',
  'chatResiduals.reconnection.waiting': 'Waiting for authorization…',
  'chatResiduals.reconnection.startFailed': 'The reconnection could not be started. Try again.',
  'chatResiduals.reconnection.authorizationFailed':
    'Authorization was not completed. Check your popup settings, then try again.',
  'chatResiduals.connectionFailed.reason.userDenied': 'The connection was denied.',
  'chatResiduals.connectionFailed.reason.invalidState': 'The OAuth state could not be verified.',
  'chatResiduals.connectionFailed.reason.providerError': 'The provider returned an error.',
  'chatResiduals.connectionFailed.reason.scopeMismatch': 'The granted scopes do not cover what the agent needs.',
  'chatResiduals.connectionFailed.reason.timeout': 'The provider did not respond in time.',
  'chatResiduals.connectionFailed.reason.generic': 'The connection could not be completed.',
  'chatResiduals.connectionFailed.title': '{provider} connection could not be completed.',
  'chatResiduals.connectionResolved.success': '{provider} connected as {account}.',
  'chatResiduals.discuss.title': 'Discuss',
  'chatResiduals.messages.persistenceUnavailable': 'Conversation history is not available.',
  'chatResiduals.messages.forkFailed': 'The conversation could not be forked. Try again.',
  'chatResiduals.messages.streaming': 'The agent is responding…',
  'chatResiduals.progress.agent': 'Agent',
  'chatResiduals.progress.done': 'Done',
  'chatResiduals.progress.interrupted': 'Interrupted',
  'chatResiduals.progress.ariaInterrupted': 'Agent, interrupted at {percent}% — the run did not finish',
  'chatResiduals.progress.working': 'Working',
  'chatResiduals.progress.aria': 'Agent, {phase}, {percent}% complete',
  'chatResiduals.progress.percent': '{percent}%',
  'chatResiduals.thought.expandHint': 'Select to expand',
  'chatResiduals.thought.expandAria': 'Expand {title}',
  'chatResiduals.thought.collapseAria': 'Collapse {title}',
  'chatResiduals.user.editAria': 'Edit and resend this message',
  'chatResiduals.user.editTooltip': 'Edit and resend',
  'chatResiduals.user.avatarAlt': 'User',
  'chatResiduals.user.imageAlt': 'Attached image {count}',
} as const;

export type ChatResidualsKey = keyof typeof chatResidualsEn;
export type ChatResidualsCopy = Readonly<Record<ChatResidualsKey, string>>;

export const chatResidualsFr: ChatResidualsCopy = {
  'chatResiduals.agentRepair.aria': 'Historique des corrections automatiques de l’agent',
  'chatResiduals.agentRepair.title': 'Historique des corrections automatiques',
  'chatResiduals.agentRepair.outcome.repaired': 'Corrigé',
  'chatResiduals.agentRepair.outcome.failed': 'Échec',
  'chatResiduals.agentRepair.outcome.gaveUp': 'Abandon',
  'chatResiduals.agentRepair.outcome.unknown': 'Résultat inconnu',
  'chatResiduals.agentRepair.attempt_one': 'tentative {count}',
  'chatResiduals.agentRepair.attempt_other': 'tentative {count}',
  'chatResiduals.agentRepair.validationFailed': 'La validation du code a échoué.',
  'chatResiduals.agentRepair.repairFailed': 'La correction automatique n’a pas pu être appliquée.',
  'chatResiduals.agentRepair.location': ' Ligne {line}, colonne {column}.',
  'chatResiduals.agentRepair.dateUnavailable': 'Date indisponible',
  'chatResiduals.generate.title': 'Ce projet n’a pas encore été généré',
  'chatResiduals.generate.description':
    'L’espace de travail contient uniquement un README. Générez l’application à partir de votre prompt initial.',
  'chatResiduals.generate.action': 'Générer l’application',
  'chatResiduals.supabase.queryTitle': 'Requête Supabase',
  'chatResiduals.supabase.connectionTitle': 'Connexion Supabase requise',
  'chatResiduals.supabase.queryDescription': 'Exécuter la requête de base de données',
  'chatResiduals.supabase.connectionDescription': 'Connexion Supabase requise',
  'chatResiduals.supabase.reviewMessage':
    'Vérifiez les modifications proposées avant de les appliquer à votre base de données.',
  'chatResiduals.supabase.connectMessage': 'Connectez Supabase pour poursuivre cette opération.',
  'chatResiduals.supabase.connectFirst': 'Connectez Supabase, puis sélectionnez un projet.',
  'chatResiduals.supabase.showQuery': 'Afficher la requête de base de données proposée',
  'chatResiduals.supabase.hideQuery': 'Masquer la requête de base de données proposée',
  'chatResiduals.supabase.connect': 'Connecter Supabase',
  'chatResiduals.supabase.apply': 'Appliquer les modifications',
  'chatResiduals.supabase.applying': 'Application…',
  'chatResiduals.supabase.dismiss': 'Fermer',
  'chatResiduals.supabase.executionFailed':
    'La requête Supabase n’a pas pu être appliquée. Vérifiez le SQL, puis réessayez.',
  'chatResiduals.supabase.agentRetryMessage':
    'La requête Supabase n’a pas pu être appliquée. Vérifiez le SQL et renvoyez une requête corrigée.',
  'chatResiduals.export.trigger': 'Exporter',
  'chatResiduals.export.downloadCode': 'Télécharger le code',
  'chatResiduals.export.exportChat': 'Exporter la conversation',
  'chatResiduals.code.copy': 'Copier le code',
  'chatResiduals.code.copied': 'Copié',
  'chatResiduals.code.copyFailed': 'Impossible de copier le code. Réessayez.',
  'chatResiduals.code.highlightFailed': 'La coloration syntaxique est indisponible. Le code est affiché en texte brut.',
  'chatResiduals.mentions.aria': 'Mentions de fichiers',
  'chatResiduals.mentions.empty': 'Aucun fichier correspondant',
  'chatResiduals.markdown.thoughtProcess': 'Raisonnement',
  'chatResiduals.plan.aria': 'Liste des étapes du plan',
  'chatResiduals.plan.fallbackTitle': 'Plan',
  'chatResiduals.plan.progressAria': 'Progression du plan',
  'chatResiduals.plan.progress': '{completed} étapes terminées sur {total}',
  'chatResiduals.plan.failed_one': '{count} en échec',
  'chatResiduals.plan.failed_other': '{count} en échec',
  'chatResiduals.plan.status.pending': 'En attente',
  'chatResiduals.plan.status.inProgress': 'En cours',
  'chatResiduals.plan.status.completed': 'Terminé',
  'chatResiduals.plan.status.failed': 'Échec',
  'chatResiduals.plan.itemAria': '{description}, {status}',
  'chatResiduals.reconnection.reason.tokenExpired': 'Le jeton d’accès a expiré.',
  'chatResiduals.reconnection.reason.tokenRevoked': 'Le fournisseur a révoqué le jeton d’accès.',
  'chatResiduals.reconnection.reason.scopeInsufficient':
    'Les autorisations actuelles ne couvrent plus la demande de l’agent.',
  'chatResiduals.reconnection.reason.generic': 'Reconnectez ce service pour continuer.',
  'chatResiduals.reconnection.success': '{provider} a été reconnecté avec le compte {account}.',
  'chatResiduals.reconnection.title': 'Reconnecter {provider}',
  'chatResiduals.reconnection.action': 'Reconnecter {provider}',
  'chatResiduals.reconnection.waiting': 'En attente de l’autorisation…',
  'chatResiduals.reconnection.startFailed': 'Impossible de démarrer la reconnexion. Réessayez.',
  'chatResiduals.reconnection.authorizationFailed':
    'L’autorisation n’a pas abouti. Vérifiez les paramètres des fenêtres pop-up, puis réessayez.',
  'chatResiduals.connectionFailed.reason.userDenied': 'La connexion a été refusée.',
  'chatResiduals.connectionFailed.reason.invalidState': 'La demande OAuth n’a pas pu être vérifiée.',
  'chatResiduals.connectionFailed.reason.providerError': 'Le fournisseur n’a pas pu établir la connexion.',
  'chatResiduals.connectionFailed.reason.scopeMismatch':
    'Les autorisations accordées ne couvrent pas les besoins de l’agent.',
  'chatResiduals.connectionFailed.reason.timeout': 'Le fournisseur n’a pas répondu à temps.',
  'chatResiduals.connectionFailed.reason.generic': 'La connexion n’a pas pu être établie.',
  'chatResiduals.connectionFailed.title': 'La connexion à {provider} n’a pas pu être établie.',
  'chatResiduals.connectionResolved.success': '{provider} est connecté avec le compte {account}.',
  'chatResiduals.discuss.title': 'Discussion',
  'chatResiduals.messages.persistenceUnavailable': 'L’historique de la conversation est indisponible.',
  'chatResiduals.messages.forkFailed': 'Impossible de dupliquer la conversation. Réessayez.',
  'chatResiduals.messages.streaming': 'L’agent répond…',
  'chatResiduals.progress.agent': 'Agent',
  'chatResiduals.progress.done': 'Terminé',
  'chatResiduals.progress.interrupted': 'Interrompu',
  'chatResiduals.progress.ariaInterrupted': 'Agent, interrompu à {percent} % — l’exécution ne s’est pas terminée',
  'chatResiduals.progress.working': 'En cours',
  'chatResiduals.progress.aria': 'Agent, {phase}, progression {percent} %',
  'chatResiduals.progress.percent': '{percent} %',
  'chatResiduals.thought.expandHint': 'Sélectionnez pour développer',
  'chatResiduals.thought.expandAria': 'Développer {title}',
  'chatResiduals.thought.collapseAria': 'Réduire {title}',
  'chatResiduals.user.editAria': 'Modifier et renvoyer ce message',
  'chatResiduals.user.editTooltip': 'Modifier et renvoyer',
  'chatResiduals.user.avatarAlt': 'Utilisateur',
  'chatResiduals.user.imageAlt': 'Image jointe {count}',
};

export function resolveChatResidualsLanguage(language?: string | null): 'en' | 'fr' {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

export function getChatResidualsCopy(language?: string | null): ChatResidualsCopy {
  return resolveChatResidualsLanguage(language) === 'fr' ? chatResidualsFr : chatResidualsEn;
}

export function formatChatResidualsCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatChatResidualsNumber(value: number, language?: string | null): string {
  const locale = resolveChatResidualsLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';

  return new Intl.NumberFormat(locale).format(value);
}

export function formatChatResidualsPlural(
  language: string | null | undefined,
  count: number,
  templates: Readonly<{ one: string; other: string }>,
): string {
  const locale = resolveChatResidualsLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
  const template = new Intl.PluralRules(locale).select(count) === 'one' ? templates.one : templates.other;

  return formatChatResidualsCopy(template, { count: new Intl.NumberFormat(locale).format(count) });
}

export function formatChatResidualsDate(iso: string, language?: string | null, unavailable?: string): string {
  const date = new Date(iso);

  if (!Number.isFinite(date.getTime())) {
    return unavailable ?? getChatResidualsCopy(language)['chatResiduals.agentRepair.dateUnavailable'];
  }

  const locale = resolveChatResidualsLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';

  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function formatAgentRepairDiagnostic(
  language: string | null | undefined,
  kind: 'validation' | 'repair',
  rawDiagnostic?: string | null,
): string {
  const copy = getChatResidualsCopy(language);

  const base =
    kind === 'validation'
      ? copy['chatResiduals.agentRepair.validationFailed']
      : copy['chatResiduals.agentRepair.repairFailed'];

  const location = rawDiagnostic?.match(/(?:\(|\bline\s+)(\d+)(?::|\s*,?\s*column\s+)(\d+)\)?/iu);

  if (!location) {
    return base;
  }

  return `${base}${formatChatResidualsCopy(copy['chatResiduals.agentRepair.location'], {
    line: formatChatResidualsNumber(Number(location[1]), language),
    column: formatChatResidualsNumber(Number(location[2]), language),
  })}`;
}

const CONNECTION_FAILURE_KEYS = {
  user_denied: 'chatResiduals.connectionFailed.reason.userDenied',
  invalid_state: 'chatResiduals.connectionFailed.reason.invalidState',
  provider_error: 'chatResiduals.connectionFailed.reason.providerError',
  scope_mismatch: 'chatResiduals.connectionFailed.reason.scopeMismatch',
  timeout: 'chatResiduals.connectionFailed.reason.timeout',
} as const satisfies Readonly<Record<string, ChatResidualsKey>>;

export function getConnectionFailureReasonLabel(
  language: string | null | undefined,
  reason: string | undefined,
): string {
  const copy = getChatResidualsCopy(language);
  const key = reason ? CONNECTION_FAILURE_KEYS[reason as keyof typeof CONNECTION_FAILURE_KEYS] : undefined;

  return key ? copy[key] : copy['chatResiduals.connectionFailed.reason.generic'];
}

const RECONNECTION_REASON_KEYS = {
  token_expired: 'chatResiduals.reconnection.reason.tokenExpired',
  token_revoked: 'chatResiduals.reconnection.reason.tokenRevoked',
  scope_insufficient: 'chatResiduals.reconnection.reason.scopeInsufficient',
} as const satisfies Readonly<Record<string, ChatResidualsKey>>;

export function getReconnectionReasonLabel(language: string | null | undefined, reason: string | undefined): string {
  const copy = getChatResidualsCopy(language);
  const key = reason ? RECONNECTION_REASON_KEYS[reason as keyof typeof RECONNECTION_REASON_KEYS] : undefined;

  return key ? copy[key] : copy['chatResiduals.reconnection.reason.generic'];
}

/**
 * Progress annotations are already localized by the API. This remaps exact
 * persisted catalogue values when the user switches locale while a transcript
 * is open, without touching arbitrary agent or user-authored text.
 */
export function localizePersistedProgressMessage(
  message: string | undefined,
  language: string | null | undefined,
): string | undefined {
  if (!message?.trim()) {
    return undefined;
  }

  const targetLanguage = resolveChatResidualsLanguage(language);
  const sourceEntries = Object.entries(apiChatCatalog.en) as Array<[ApiChatCopyKey, string]>;

  for (const [key, english] of sourceEntries) {
    if (message === english || message === apiChatCatalog.fr[key]) {
      return apiChatCatalog[targetLanguage][key];
    }
  }

  return message;
}
