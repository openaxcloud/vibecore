import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export const chatBoxEn = {
  'chatBox.settings.showAgent': 'Show agent settings',
  'chatBox.settings.hideAgent': 'Hide agent settings',
  'chatBox.settings.model': 'Model Settings',
  'chatBox.enhance.inProgress': 'Enhancing your prompt with AI',
  'chatBox.enhance.emptyHint': 'Type a prompt to enable AI prompt enhancement',
  'chatBox.enhance.readyHint': 'Enhance this prompt with AI before sending',
  'chatBox.enhance.action': 'Enhance prompt',
  'chatBox.planFirst.title': 'Plan first: propose a reviewable plan and wait for approval before editing',
  'chatBox.planFirst.label': 'Plan',
  'chatBox.inspector.selected': 'selected for inspection',
  'chatBox.inspector.clearAria': 'Clear selected inspected element',
  'chatBox.inspector.clear': 'Clear',
  'chatBox.prompt.agentAria': 'Agent prompt',
  'chatBox.prompt.chatAria': 'Chat prompt',
  'chatBox.prompt.buildPlaceholder': 'How can E-Code help you today?',
  'chatBox.prompt.discussPlaceholder': 'What would you like to discuss?',
  'chatBox.error.droppedImage': 'Failed to read the dropped image. Please try again.',
  'chatBox.attachments.attach': 'Attach images',
  'chatBox.attachments.summary.one': '{{count}} of {{max}} image attached',
  'chatBox.attachments.summary.other': '{{count}} of {{max}} images attached',
  'chatBox.tools.more': 'More composer & tools',
  'chatBox.tools.menuAria': 'Composer tools',
  'chatBox.tools.mcp': 'MCP tools',
  'chatBox.tools.fetchUrl': 'Fetch URL',
  'chatBox.speech.stop': 'Stop speech',
  'chatBox.speech.start': 'Speech',
  'chatBox.discuss.title': 'Discuss',
  'chatBox.discuss.switchToBuild': 'Switch to build',
  'chatBox.shortcuts.title': 'Composer shortcuts',
  'chatBox.shortcuts.newLine': 'Shift + Return inserts a new line',
} as const;

export type ChatBoxKey = keyof typeof chatBoxEn;
export type ChatBoxCopy = Readonly<Record<ChatBoxKey, string>>;

export const chatBoxFr: ChatBoxCopy = {
  'chatBox.settings.showAgent': 'Afficher les paramètres de l’agent',
  'chatBox.settings.hideAgent': 'Masquer les paramètres de l’agent',
  'chatBox.settings.model': 'Paramètres du modèle',
  'chatBox.enhance.inProgress': 'Amélioration de votre prompt par l’IA',
  'chatBox.enhance.emptyHint': 'Saisissez un prompt pour activer son amélioration par l’IA',
  'chatBox.enhance.readyHint': 'Améliorer ce prompt avec l’IA avant l’envoi',
  'chatBox.enhance.action': 'Améliorer le prompt',
  'chatBox.planFirst.title':
    'Planifier d’abord : proposer un plan vérifiable et attendre votre approbation avant toute modification',
  'chatBox.planFirst.label': 'Planifier',
  'chatBox.inspector.selected': 'sélectionné pour inspection',
  'chatBox.inspector.clearAria': 'Effacer l’élément sélectionné pour inspection',
  'chatBox.inspector.clear': 'Effacer',
  'chatBox.prompt.agentAria': 'Prompt de l’agent',
  'chatBox.prompt.chatAria': 'Prompt de discussion',
  'chatBox.prompt.buildPlaceholder': 'Comment E-Code peut-il vous aider aujourd’hui ?',
  'chatBox.prompt.discussPlaceholder': 'De quoi souhaitez-vous discuter ?',
  'chatBox.error.droppedImage': 'Impossible de lire l’image déposée. Réessayez.',
  'chatBox.attachments.attach': 'Joindre des images',
  'chatBox.attachments.summary.one': '{{count}} image jointe sur {{max}}',
  'chatBox.attachments.summary.other': '{{count}} images jointes sur {{max}}',
  'chatBox.tools.more': 'Plus d’options et d’outils',
  'chatBox.tools.menuAria': 'Outils du prompt',
  'chatBox.tools.mcp': 'Outils MCP',
  'chatBox.tools.fetchUrl': 'Récupérer une URL',
  'chatBox.speech.stop': 'Arrêter la saisie vocale',
  'chatBox.speech.start': 'Saisie vocale',
  'chatBox.discuss.title': 'Discuter',
  'chatBox.discuss.switchToBuild': 'Passer en mode création',
  'chatBox.shortcuts.title': 'Raccourcis du prompt',
  'chatBox.shortcuts.newLine': 'Maj + Entrée insère une nouvelle ligne',
};

export function resolveChatBoxLanguage(language?: string | null): MarketingLanguage {
  return resolveMarketingLanguage(language);
}

export function getChatBoxCopy(language?: string | null): ChatBoxCopy {
  return resolveChatBoxLanguage(language) === 'fr' ? chatBoxFr : chatBoxEn;
}

export function formatChatBoxCopy(template: string, values: Readonly<Record<string, string | number>> = {}): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatChatBoxAttachmentSummary(
  language: string | null | undefined,
  count: number,
  maximum: number,
): string {
  const resolved = resolveChatBoxLanguage(language);
  const locale = resolved === 'fr' ? 'fr-FR' : 'en-US';
  const copy = getChatBoxCopy(resolved);
  const pluralCategory = new Intl.PluralRules(locale).select(count);

  const template =
    pluralCategory === 'one' ? copy['chatBox.attachments.summary.one'] : copy['chatBox.attachments.summary.other'];

  const formatter = new Intl.NumberFormat(locale);

  return formatChatBoxCopy(template, {
    count: formatter.format(count),
    max: formatter.format(maximum),
  });
}

/**
 * Keep browser/FileReader details out of user-facing toasts. Raw exceptions
 * are neither localized nor safe to expose because they may contain file or
 * environment details.
 */
export function getChatBoxDroppedImageError(language?: string | null, _error?: unknown): string {
  return getChatBoxCopy(language)['chatBox.error.droppedImage'];
}
