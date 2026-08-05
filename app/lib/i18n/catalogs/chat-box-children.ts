import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export const chatBoxChildrenEn = {
  'chatBoxChildren.mode.agent.label': 'Agent',
  'chatBoxChildren.mode.agent.description': 'Runs the task end to end, autonomously.',
  'chatBoxChildren.mode.assistant.label': 'Assistant',
  'chatBoxChildren.mode.assistant.description': 'Answers and suggests scoped edits, waits for your go.',
  'chatBoxChildren.mode.triggerTitle': 'Mode: {{label}} — {{description}}',
  'chatBoxChildren.mode.menuAria': 'Agent mode',
  'chatBoxChildren.speech.startTitle': 'Start speech recognition',
  'chatBoxChildren.speech.stopTitle': 'Stop listening',
  'chatBoxChildren.speech.startLabel': 'Speech',
  'chatBoxChildren.speech.stopLabel': 'Stop speech',
  'chatBoxChildren.mcp.triggerLabel': 'MCP tools',
  'chatBoxChildren.mcp.triggerInitializing': 'Initializing MCP tools…',
  'chatBoxChildren.mcp.triggerAvailable': 'MCP tools available',
  'chatBoxChildren.mcp.triggerFailed': 'MCP tools could not be initialized — open for details',
  'chatBoxChildren.mcp.dialogTitle': 'MCP tools',
  'chatBoxChildren.mcp.dialogDescription': 'View and refresh the MCP tools available to the agent.',
  'chatBoxChildren.mcp.check': 'Check availability',
  'chatBoxChildren.mcp.checking': 'Checking availability…',
  'chatBoxChildren.mcp.activeNextMessage': 'Active for the next message',
  'chatBoxChildren.mcp.perRequestHint':
    'Unchecked servers are skipped for the next message only — your saved configuration is unchanged.',
  'chatBoxChildren.mcp.none': 'No MCP servers configured',
  'chatBoxChildren.mcp.configureHint': 'Configure servers in Settings → MCP Servers',
  'chatBoxChildren.mcp.close': 'Close',
  'chatBoxChildren.mcp.initializeFailed': 'MCP tools could not be initialized. Try again.',
  'chatBoxChildren.mcp.availabilityFailed': 'Server availability could not be checked. Try again.',
  'chatBoxChildren.web.triggerLabel': 'Fetch URL',
  'chatBoxChildren.web.triggerTitle': 'Fetch URL content',
  'chatBoxChildren.web.inputAria': 'URL to fetch',
  'chatBoxChildren.web.fetch': 'Fetch',
  'chatBoxChildren.web.fetching': 'Fetching…',
  'chatBoxChildren.web.success': 'URL content fetched',
  'chatBoxChildren.web.fetchFailed': 'URL content could not be fetched. Check the address and try again.',
  'chatBoxChildren.web.resultSource': '[Web content from {{sourceUrl}}]',
  'chatBoxChildren.web.resultTitle': 'Title: {{title}}',
  'chatBoxChildren.web.resultDescription': 'Description: {{description}}',
} as const;

export type ChatBoxChildrenKey = keyof typeof chatBoxChildrenEn;
export type ChatBoxChildrenCopy = Readonly<Record<ChatBoxChildrenKey, string>>;

export const chatBoxChildrenFr: ChatBoxChildrenCopy = {
  'chatBoxChildren.mode.agent.label': 'Agent',
  'chatBoxChildren.mode.agent.description': 'Exécute la tâche de bout en bout, de façon autonome.',
  'chatBoxChildren.mode.assistant.label': 'Assistant',
  'chatBoxChildren.mode.assistant.description':
    'Répond et propose des modifications ciblées, puis attend votre accord.',
  'chatBoxChildren.mode.triggerTitle': 'Mode : {{label}} — {{description}}',
  'chatBoxChildren.mode.menuAria': 'Mode de l’agent',
  'chatBoxChildren.speech.startTitle': 'Démarrer la reconnaissance vocale',
  'chatBoxChildren.speech.stopTitle': 'Arrêter l’écoute',
  'chatBoxChildren.speech.startLabel': 'Saisie vocale',
  'chatBoxChildren.speech.stopLabel': 'Arrêter la saisie vocale',
  'chatBoxChildren.mcp.triggerLabel': 'Outils MCP',
  'chatBoxChildren.mcp.triggerInitializing': 'Initialisation des outils MCP…',
  'chatBoxChildren.mcp.triggerAvailable': 'Outils MCP disponibles',
  'chatBoxChildren.mcp.triggerFailed': 'Impossible d’initialiser les outils MCP — ouvrir pour plus de détails',
  'chatBoxChildren.mcp.dialogTitle': 'Outils MCP',
  'chatBoxChildren.mcp.dialogDescription': 'Consultez et actualisez les outils MCP disponibles pour l’agent.',
  'chatBoxChildren.mcp.check': 'Vérifier la disponibilité',
  'chatBoxChildren.mcp.checking': 'Vérification de la disponibilité…',
  'chatBoxChildren.mcp.activeNextMessage': 'Actifs pour le prochain message',
  'chatBoxChildren.mcp.perRequestHint':
    'Les serveurs décochés seront ignorés uniquement pour le prochain message. Votre configuration enregistrée reste inchangée.',
  'chatBoxChildren.mcp.none': 'Aucun serveur MCP configuré',
  'chatBoxChildren.mcp.configureHint': 'Configurez les serveurs dans Paramètres → Serveurs MCP',
  'chatBoxChildren.mcp.close': 'Fermer',
  'chatBoxChildren.mcp.initializeFailed': 'Impossible d’initialiser les outils MCP. Réessayez.',
  'chatBoxChildren.mcp.availabilityFailed': 'Impossible de vérifier la disponibilité des serveurs. Réessayez.',
  'chatBoxChildren.web.triggerLabel': 'Récupérer une URL',
  'chatBoxChildren.web.triggerTitle': 'Récupérer le contenu d’une URL',
  'chatBoxChildren.web.inputAria': 'URL à récupérer',
  'chatBoxChildren.web.fetch': 'Récupérer',
  'chatBoxChildren.web.fetching': 'Récupération…',
  'chatBoxChildren.web.success': 'Contenu de l’URL récupéré',
  'chatBoxChildren.web.fetchFailed': 'Impossible de récupérer le contenu de l’URL. Vérifiez l’adresse, puis réessayez.',
  'chatBoxChildren.web.resultSource': '[Contenu web provenant de {{sourceUrl}}]',
  'chatBoxChildren.web.resultTitle': 'Titre : {{title}}',
  'chatBoxChildren.web.resultDescription': 'Description : {{description}}',
};

export function resolveChatBoxChildrenLanguage(language?: string | null): MarketingLanguage {
  return resolveMarketingLanguage(language);
}

export function getChatBoxChildrenCopy(language?: string | null): ChatBoxChildrenCopy {
  return resolveChatBoxChildrenLanguage(language) === 'fr' ? chatBoxChildrenFr : chatBoxChildrenEn;
}

export function formatChatBoxChildrenCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export interface ChatBoxWebContent {
  title: string;
  description: string;
  content: string;
  sourceUrl: string;
}

export function formatChatBoxWebContent(data: ChatBoxWebContent, language?: string | null): string {
  const copy = getChatBoxChildrenCopy(language);

  const parts: string[] = [
    formatChatBoxChildrenCopy(copy['chatBoxChildren.web.resultSource'], { sourceUrl: data.sourceUrl }),
  ];

  if (data.title) {
    parts.push(formatChatBoxChildrenCopy(copy['chatBoxChildren.web.resultTitle'], { title: data.title }));
  }

  if (data.description) {
    parts.push(
      formatChatBoxChildrenCopy(copy['chatBoxChildren.web.resultDescription'], {
        description: data.description,
      }),
    );
  }

  parts.push('', data.content);

  return parts.join('\n');
}

export type McpToolsErrorKind = 'initialize' | 'availability';

/** Never expose arbitrary MCP process/provider exceptions in the interface. */
export function getMcpToolsSafeError(
  language: string | null | undefined,
  kind: McpToolsErrorKind,
  _error?: unknown,
): string {
  const copy = getChatBoxChildrenCopy(language);

  return kind === 'initialize'
    ? copy['chatBoxChildren.mcp.initializeFailed']
    : copy['chatBoxChildren.mcp.availabilityFailed'];
}

/** Never expose an API response, network exception, or URL detail in a toast. */
export function getWebSearchSafeError(language?: string | null, _error?: unknown): string {
  return getChatBoxChildrenCopy(language)['chatBoxChildren.web.fetchFailed'];
}
