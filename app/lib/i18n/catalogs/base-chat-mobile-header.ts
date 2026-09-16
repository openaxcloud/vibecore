/*
 * i18n catalog for the owner-frozen mobile IDE header + bottom dock in
 * `app/components/chat/BaseChat.tsx` (ref IMG_9149). Only the labels are
 * externalized here — layout/structure stay frozen. EN mirrors the source
 * literals byte-for-byte. Interpolation uses the runtime single-brace form
 * ({name}, {count}).
 *
 * NOT translated (kept identical): `Prompt` — the agent-prompt product term,
 * kept as-is like Git / Webview elsewhere in the FR UI.
 */

export const baseChatMobileHeaderEn = {
  'baseChatMobileHeader.back': 'Back to dashboard',
  'baseChatMobileHeader.activity': 'Activity',
  'baseChatMobileHeader.openTools': 'Open tools',
  'baseChatMobileHeader.agentOptions': 'Agent options',
  'baseChatMobileHeader.moreOptions': 'More options',
  'baseChatMobileHeader.agentWorking': 'Working on this workspace',
  'baseChatMobileHeader.agentReady': 'Ready for the next change',
  'baseChatMobileHeader.focusPrompt': 'Focus Agent prompt',
  'baseChatMobileHeader.promptButton': 'Prompt',
  'baseChatMobileHeader.idePanels': 'IDE panels',
  'baseChatMobileHeader.openTabSwitcher': 'Open tab switcher',
  'baseChatMobileHeader.openTabs': 'Open tabs',
  'baseChatMobileHeader.search': 'Search tools and files',
  'baseChatMobileHeader.switchToTab': 'Switch to {name} tab',
  'baseChatMobileHeader.moreTabs': 'Show {count} more tabs',
  'baseChatMobileHeader.addNewTab': 'Add new tab',
} as const;

export const baseChatMobileHeaderFr: Record<keyof typeof baseChatMobileHeaderEn, string> = {
  'baseChatMobileHeader.back': 'Retour au tableau de bord',
  'baseChatMobileHeader.activity': 'Activité',
  'baseChatMobileHeader.openTools': 'Ouvrir les outils',
  'baseChatMobileHeader.agentOptions': 'Options de l’agent',
  'baseChatMobileHeader.moreOptions': 'Plus d’options',
  'baseChatMobileHeader.agentWorking': 'Travail sur cet espace de travail',
  'baseChatMobileHeader.agentReady': 'Prêt pour la prochaine modification',
  'baseChatMobileHeader.focusPrompt': 'Cibler le prompt de l’agent',
  'baseChatMobileHeader.promptButton': 'Prompt',
  'baseChatMobileHeader.idePanels': 'Panneaux IDE',
  'baseChatMobileHeader.openTabSwitcher': 'Ouvrir le sélecteur d’onglets',
  'baseChatMobileHeader.openTabs': 'Onglets ouverts',
  'baseChatMobileHeader.search': 'Rechercher des outils et des fichiers',
  'baseChatMobileHeader.switchToTab': 'Passer à l’onglet {name}',
  'baseChatMobileHeader.moreTabs': 'Afficher {count} onglets de plus',
  'baseChatMobileHeader.addNewTab': 'Ajouter un onglet',
};
