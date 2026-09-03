import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export const chatControlsEn = {
  'chatControls.model.noProviders':
    'No providers are enabled. Enable at least one provider in Settings to start using chat.',
  'chatControls.provider.running': '{provider} is running',
  'chatControls.provider.unreachable': '{provider} is not reachable',
  'chatControls.provider.checking': 'Checking…',
  'chatControls.provider.select': 'Select provider',
  'chatControls.provider.searchPlaceholder': 'Search providers…',
  'chatControls.provider.searchAria': 'Search providers',
  'chatControls.search.clear': 'Clear search',
  'chatControls.provider.noMatch': 'No providers match “{query}”',
  'chatControls.provider.none': 'No providers found',
  'chatControls.provider.searchHint': 'Try a provider name such as OpenAI, Anthropic, or Google.',
  'chatControls.provider.selectAria': 'Select {provider} provider',
  'chatControls.model.select': 'Select model',
  'chatControls.model.freeOnly': 'Free models only',
  'chatControls.model.freeCount.one': '{count} free model',
  'chatControls.model.freeCount.other': '{count} free models',
  'chatControls.model.resultCount.one': '{count} model found',
  'chatControls.model.resultCount.other': '{count} models found',
  'chatControls.model.bestMatches': 'showing the best matches',
  'chatControls.model.searchPlaceholder': 'Search models…',
  'chatControls.model.searchAria': 'Search models',
  'chatControls.model.loading': 'Loading models…',
  'chatControls.model.loadError': 'Models could not be loaded. Check the provider connection and try again.',
  'chatControls.model.noMatch': 'No models match “{query}”{filter}',
  'chatControls.model.freeFilter': ' (free only)',
  'chatControls.model.noFree': 'No free models available',
  'chatControls.model.localNone': 'No models found — is {provider} running?',
  'chatControls.model.none': 'No models available',
  'chatControls.model.localHint': 'Make sure {provider} is running and has at least one model loaded.',
  'chatControls.model.ollamaHint': 'Try: ollama pull llama3.2',
  'chatControls.model.lmStudioHint': 'Load a model in LM Studio first.',
  'chatControls.model.searchHint': 'Try a model name, context size (for example 128k or 1M), or capability.',
  'chatControls.model.disableFreeHint': 'Disable the “Free models only” filter to see every available model.',
  'chatControls.model.selectAria': 'Select {model} model',
  'chatControls.model.autoLabel': 'Auto (recommended)',
  'chatControls.model.autoDescription': 'Fast model for simple turns, frontier model for builds',
  'chatControls.model.tokens': '{count} tokens',
  'chatControls.model.dynamicLabel.context': 'context',
  'chatControls.model.dynamicLabel.input': 'in',
  'chatControls.model.dynamicLabel.output': 'out',
  'chatControls.model.dynamicLabel.dynamic': 'dynamic',
  'chatControls.model.dynamicLabel.by': 'by',
  'chatControls.model.dynamicLabel.notAvailable': 'N/A',
  'chatControls.model.match': '{percent}% match',
  'chatControls.model.freeTitle': 'Free model',
  'chatControls.model.selected': 'Selected',
  'chatControls.power.tier.lite': 'Lite',
  'chatControls.power.tier.liteHint': 'Fast and economical. Visual tweaks, bug fixes, and targeted changes.',
  'chatControls.power.tier.economy': 'Economy',
  'chatControls.power.tier.economyHint': 'The right balance.',
  'chatControls.power.tier.power': 'Power',
  'chatControls.power.tier.powerHint': 'For complex tasks.',
  'chatControls.power.liteGuardrail':
    'Lite suits focused changes to an existing app. For a new app, major architecture change, integration, or database schema change, choose Economy or Power.',
  'chatControls.power.groupAria': 'Agent mode (press Command-Shift-I to cycle)',
  'chatControls.power.availableTitle': '{label} — {hint} (Command-Shift-I cycles modes)',
  'chatControls.power.unavailableTitle': '{label} is not available on your plan',
  'chatControls.power.advancedTitle': 'Advanced settings: High effort and Turbo',
  'chatControls.power.compactAria': 'Agent mode: {mode}. Opens advanced settings.',
  'chatControls.power.advanced': 'Advanced',
  'chatControls.power.estimatedTitle': 'Estimated cost for this request',
  'chatControls.power.dialogAria': 'Advanced agent settings',
  'chatControls.power.dialogTitle': 'Advanced settings',
  'chatControls.power.modesTitle': 'Agent modes',
  'chatControls.power.effortLow': 'Standard',
  'chatControls.power.effortHigh': 'High',
  'chatControls.power.back': 'Back to modes',
  'chatControls.power.locked': 'Not available on your plan',
  'chatControls.power.highEffort': 'High effort',
  'chatControls.power.highEffortDescription': 'Escalates only genuinely hard tasks, with no systematic surcharge.',
  'chatControls.power.highEffortLite': 'High effort is not available in Lite',
  'chatControls.power.highEffortAvailable':
    'Escalates only genuinely hard tasks to a more capable model. Easier tasks incur no extra credit.',
  'chatControls.power.highEffortPaid': 'High effort is available on paid plans',
  'chatControls.power.proBadge': 'Pro',
  'chatControls.power.turbo': 'Turbo',
  'chatControls.power.turboDescription': 'Power only. Off by default; an organization admin enables it.',
  'chatControls.power.turboPower': 'Turbo is only available in Power mode',
  'chatControls.power.turboAvailable': 'Fastest responses, billed at the advertised multiplier.',
  'chatControls.power.turboOrganization': 'Turbo is enabled by your organization admin',
  'chatControls.power.organizationBadge': 'Org',
  'chatControls.power.upgrade': 'Upgrade to unlock advanced settings',
  'chatControls.power.estimated': 'Est. cost',
} as const;

export type ChatControlsKey = keyof typeof chatControlsEn;
export type ChatControlsCopy = Readonly<Record<ChatControlsKey, string>>;

export const chatControlsFr: ChatControlsCopy = {
  'chatControls.model.noProviders':
    'Aucun fournisseur n’est activé. Activez-en au moins un dans les paramètres pour utiliser le chat.',
  'chatControls.provider.running': '{provider} est en cours d’exécution',
  'chatControls.provider.unreachable': '{provider} est inaccessible',
  'chatControls.provider.checking': 'Vérification…',
  'chatControls.provider.select': 'Sélectionner un fournisseur',
  'chatControls.provider.searchPlaceholder': 'Rechercher des fournisseurs…',
  'chatControls.provider.searchAria': 'Rechercher des fournisseurs',
  'chatControls.search.clear': 'Effacer la recherche',
  'chatControls.provider.noMatch': 'Aucun fournisseur ne correspond à « {query} »',
  'chatControls.provider.none': 'Aucun fournisseur trouvé',
  'chatControls.provider.searchHint': 'Essayez un nom de fournisseur comme OpenAI, Anthropic ou Google.',
  'chatControls.provider.selectAria': 'Sélectionner le fournisseur {provider}',
  'chatControls.model.select': 'Sélectionner un modèle',
  'chatControls.model.freeOnly': 'Modèles gratuits uniquement',
  'chatControls.model.freeCount.one': '{count} modèle gratuit',
  'chatControls.model.freeCount.other': '{count} modèles gratuits',
  'chatControls.model.resultCount.one': '{count} modèle trouvé',
  'chatControls.model.resultCount.other': '{count} modèles trouvés',
  'chatControls.model.bestMatches': 'meilleurs résultats affichés',
  'chatControls.model.searchPlaceholder': 'Rechercher des modèles…',
  'chatControls.model.searchAria': 'Rechercher des modèles',
  'chatControls.model.loading': 'Chargement des modèles…',
  'chatControls.model.loadError':
    'Impossible de charger les modèles. Vérifiez la connexion au fournisseur, puis réessayez.',
  'chatControls.model.noMatch': 'Aucun modèle ne correspond à « {query} »{filter}',
  'chatControls.model.freeFilter': ' (gratuits uniquement)',
  'chatControls.model.noFree': 'Aucun modèle gratuit disponible',
  'chatControls.model.localNone': 'Aucun modèle trouvé — {provider} est-il en cours d’exécution ?',
  'chatControls.model.none': 'Aucun modèle disponible',
  'chatControls.model.localHint':
    'Vérifiez que {provider} est en cours d’exécution et qu’au moins un modèle y est chargé.',
  'chatControls.model.ollamaHint': 'Essayez : ollama pull llama3.2',
  'chatControls.model.lmStudioHint': 'Chargez d’abord un modèle dans LM Studio.',
  'chatControls.model.searchHint':
    'Essayez un nom de modèle, une taille de contexte (par exemple 128k ou 1M) ou une capacité.',
  'chatControls.model.disableFreeHint':
    'Désactivez le filtre « Modèles gratuits uniquement » pour afficher tous les modèles disponibles.',
  'chatControls.model.selectAria': 'Sélectionner le modèle {model}',
  'chatControls.model.autoLabel': 'Auto (recommandé)',
  'chatControls.model.autoDescription':
    'Modèle rapide pour les échanges simples, modèle de pointe pour les compilations',
  'chatControls.model.tokens': '{count} jetons',
  'chatControls.model.dynamicLabel.context': 'contexte',
  'chatControls.model.dynamicLabel.input': 'entrée',
  'chatControls.model.dynamicLabel.output': 'sortie',
  'chatControls.model.dynamicLabel.dynamic': 'dynamique',
  'chatControls.model.dynamicLabel.by': 'par',
  'chatControls.model.dynamicLabel.notAvailable': 'N/D',
  'chatControls.model.match': '{percent} % de correspondance',
  'chatControls.model.freeTitle': 'Modèle gratuit',
  'chatControls.model.selected': 'Sélectionné',
  'chatControls.power.tier.lite': 'Léger',
  'chatControls.power.tier.liteHint':
    'Rapide et économique. Ajustements visuels, corrections de bugs et modifications ciblées.',
  'chatControls.power.tier.economy': 'Économique',
  'chatControls.power.tier.economyHint': 'Le juste équilibre.',
  'chatControls.power.tier.power': 'Puissance',
  'chatControls.power.tier.powerHint': 'Pour les tâches complexes.',
  'chatControls.power.liteGuardrail':
    'Le mode Léger convient aux modifications ciblées d’une application existante. Pour une nouvelle application, une évolution majeure de l’architecture, une intégration ou un changement de schéma de base de données, choisissez Économique ou Puissance.',
  'chatControls.power.groupAria': 'Mode de l’agent (Commande-Maj-I pour changer)',
  'chatControls.power.availableTitle': '{label} — {hint} (Commande-Maj-I change de mode)',
  'chatControls.power.unavailableTitle': '{label} n’est pas disponible avec votre offre',
  'chatControls.power.advancedTitle': 'Paramètres avancés : effort élevé et Turbo',
  'chatControls.power.compactAria': "Mode de l'agent : {mode}. Ouvre les réglages avancés.",
  'chatControls.power.advanced': 'Avancé',
  'chatControls.power.estimatedTitle': 'Coût estimé de cette demande',
  'chatControls.power.dialogAria': 'Paramètres avancés de l’agent',
  'chatControls.power.dialogTitle': 'Paramètres avancés',
  'chatControls.power.modesTitle': 'Modes de l’agent',
  'chatControls.power.effortLow': 'Standard',
  'chatControls.power.effortHigh': 'Élevé',
  'chatControls.power.back': 'Revenir aux modes',
  'chatControls.power.locked': 'Indisponible avec votre formule',
  'chatControls.power.highEffort': 'Effort élevé',
  'chatControls.power.highEffortDescription':
    'Réserve les modèles plus puissants aux tâches réellement difficiles, sans surcoût systématique.',
  'chatControls.power.highEffortLite': 'L’effort élevé n’est pas disponible en mode Léger',
  'chatControls.power.highEffortAvailable':
    'Réserve un modèle plus puissant aux tâches réellement difficiles. Les tâches plus simples ne consomment aucun crédit supplémentaire.',
  'chatControls.power.highEffortPaid': 'L’effort élevé est disponible avec les offres payantes',
  'chatControls.power.proBadge': 'Pro',
  'chatControls.power.turbo': 'Turbo',
  'chatControls.power.turboDescription':
    'Mode Puissance uniquement. Désactivé par défaut ; un administrateur de l’organisation peut l’activer.',
  'chatControls.power.turboPower': 'Turbo est uniquement disponible en mode Puissance',
  'chatControls.power.turboAvailable': 'Réponses les plus rapides, facturées selon le multiplicateur indiqué.',
  'chatControls.power.turboOrganization': 'Turbo doit être activé par un administrateur de votre organisation',
  'chatControls.power.organizationBadge': 'Org.',
  'chatControls.power.upgrade': 'Changer d’offre pour débloquer les paramètres avancés',
  'chatControls.power.estimated': 'Coût estimé',
};

export function resolveChatControlsLanguage(language?: string | null): MarketingLanguage {
  return resolveMarketingLanguage(language);
}

export function getChatControlsCopy(language?: string | null): ChatControlsCopy {
  return resolveChatControlsLanguage(language) === 'fr' ? chatControlsFr : chatControlsEn;
}

export function formatChatControlsCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatChatControlsPlural(
  language: string | null | undefined,
  count: number,
  one: string,
  other: string,
): string {
  const resolved = resolveChatControlsLanguage(language);
  const locale = resolved === 'fr' ? 'fr-FR' : 'en-US';
  const template = new Intl.PluralRules(locale).select(count) === 'one' ? one : other;

  return formatChatControlsCopy(template, { count: new Intl.NumberFormat(locale).format(count) });
}

export function formatChatControlsCost(cents: number | undefined, language?: string | null): string {
  if (cents == null || !Number.isFinite(cents)) {
    return '—';
  }

  const resolvedLanguage = resolveChatControlsLanguage(language);
  const locale = resolvedLanguage === 'fr' ? 'fr-FR' : 'en-US';

  const amount = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.max(0, cents) / 100);

  return `${resolvedLanguage === 'fr' ? '≈' : '~'}${amount}`;
}
