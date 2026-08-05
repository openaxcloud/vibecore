import { resolveMarketingLanguage } from './marketing';

export const featuresSettingsEn = {
  'featuresSettings.badge.beta': 'Beta',
  'featuresSettings.badge.experimental': 'Experimental',
  'featuresSettings.state.enabled': 'enabled',
  'featuresSettings.state.disabled': 'disabled',
  'featuresSettings.toast.state': '{feature} {state}',
  'featuresSettings.latestBranch.title': 'Main branch updates',
  'featuresSettings.latestBranch.description': 'Get the latest updates from the main branch.',
  'featuresSettings.latestBranch.tooltip': 'When enabled, E-Code receives updates from the main development branch.',
  'featuresSettings.autoTemplate.title': 'Automatic template selection',
  'featuresSettings.autoTemplate.description': 'Automatically select a starter template.',
  'featuresSettings.autoTemplate.tooltip': 'When enabled, E-Code selects the most appropriate starter template.',
  'featuresSettings.context.title': 'Context optimization',
  'featuresSettings.context.description': 'Optimize context for better responses.',
  'featuresSettings.context.tooltip': 'Enabled by default to improve AI responses.',
  'featuresSettings.eventLogs.title': 'Event logging',
  'featuresSettings.eventLogs.description': 'Enable detailed event logging and history.',
  'featuresSettings.eventLogs.tooltip': 'Enabled by default to record detailed system events and user actions.',
  'featuresSettings.toggleAria': 'Toggle {feature}',
  'featuresSettings.core.title': 'Core features',
  'featuresSettings.core.description': 'Essential features enabled by default for optimal performance.',
  'featuresSettings.beta.title': 'Beta features',
  'featuresSettings.beta.description': 'New features ready for testing that may still have rough edges.',
  'featuresSettings.prompt.title': 'Prompt library',
  'featuresSettings.prompt.description': 'Choose the system prompt used by the agent.',
  'featuresSettings.prompt.aria': 'Prompt library',
  'featuresSettings.prompt.updated': 'Prompt template updated',
  'featuresSettings.prompt.default': 'Default prompt',
  'featuresSettings.prompt.original': 'Original prompt',
  'featuresSettings.prompt.optimized': 'Optimized prompt (experimental)',
} as const;

export type FeaturesSettingsKey = keyof typeof featuresSettingsEn;
export type FeaturesSettingsCopy = Readonly<Record<FeaturesSettingsKey, string>>;

export const featuresSettingsFr: FeaturesSettingsCopy = {
  'featuresSettings.badge.beta': 'Bêta',
  'featuresSettings.badge.experimental': 'Expérimental',
  'featuresSettings.state.enabled': 'activé',
  'featuresSettings.state.disabled': 'désactivé',
  'featuresSettings.toast.state': '{feature} : {state}',
  'featuresSettings.latestBranch.title': 'Mises à jour de la branche principale',
  'featuresSettings.latestBranch.description': 'Recevez les dernières mises à jour de la branche principale.',
  'featuresSettings.latestBranch.tooltip':
    'Lorsque cette option est activée, E-Code reçoit les mises à jour de la branche principale de développement.',
  'featuresSettings.autoTemplate.title': 'Sélection automatique du modèle',
  'featuresSettings.autoTemplate.description': 'Sélectionnez automatiquement un modèle de démarrage.',
  'featuresSettings.autoTemplate.tooltip':
    'Lorsque cette option est activée, E-Code sélectionne le modèle de démarrage le plus adapté.',
  'featuresSettings.context.title': 'Optimisation du contexte',
  'featuresSettings.context.description': 'Optimisez le contexte afin d’obtenir de meilleures réponses.',
  'featuresSettings.context.tooltip': 'Activée par défaut pour améliorer les réponses de l’IA.',
  'featuresSettings.eventLogs.title': 'Journalisation des événements',
  'featuresSettings.eventLogs.description': 'Activez la journalisation détaillée des événements et leur historique.',
  'featuresSettings.eventLogs.tooltip':
    'Activée par défaut pour enregistrer les événements système et les actions utilisateur en détail.',
  'featuresSettings.toggleAria': 'Activer ou désactiver {feature}',
  'featuresSettings.core.title': 'Fonctionnalités principales',
  'featuresSettings.core.description':
    'Fonctionnalités essentielles activées par défaut pour des performances optimales.',
  'featuresSettings.beta.title': 'Fonctionnalités bêta',
  'featuresSettings.beta.description':
    'Nouvelles fonctionnalités prêtes à être testées, mais susceptibles de nécessiter encore des ajustements.',
  'featuresSettings.prompt.title': 'Bibliothèque de prompts',
  'featuresSettings.prompt.description': 'Choisissez le prompt système utilisé par l’agent.',
  'featuresSettings.prompt.aria': 'Bibliothèque de prompts',
  'featuresSettings.prompt.updated': 'Modèle de prompt mis à jour',
  'featuresSettings.prompt.default': 'Prompt par défaut',
  'featuresSettings.prompt.original': 'Prompt d’origine',
  'featuresSettings.prompt.optimized': 'Prompt optimisé (expérimental)',
};

export function getFeaturesSettingsCopy(language?: string | null): FeaturesSettingsCopy {
  return resolveMarketingLanguage(language) === 'fr' ? featuresSettingsFr : featuresSettingsEn;
}

export function formatFeaturesSettingsCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
