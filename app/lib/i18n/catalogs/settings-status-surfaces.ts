import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const settingsStatusSurfacesEn = {
  'settingsStatus.cloud.title': 'Cloud providers',
  'settingsStatus.cloud.description': 'Connect cloud-based AI models and services.',
  'settingsStatus.cloud.enableAll': 'Enable all cloud providers',
  'settingsStatus.cloud.allEnabled': 'All cloud providers enabled.',
  'settingsStatus.cloud.allDisabled': 'All cloud providers disabled.',
  'settingsStatus.cloud.loading': 'Loading cloud providers…',
  'settingsStatus.cloud.loadErrorTitle': 'Cloud providers could not be loaded',
  'settingsStatus.cloud.loadErrorDescription': 'Provider settings are temporarily unavailable. Please try again.',
  'settingsStatus.cloud.retry': 'Try again',
  'settingsStatus.cloud.emptyTitle': 'No cloud providers available',
  'settingsStatus.cloud.emptyDescription': 'No compatible cloud provider is configured for this workspace yet.',
  'settingsStatus.cloud.configurable': 'Configurable',
  'settingsStatus.cloud.description.anthropic': 'Access Claude and other Anthropic models.',
  'settingsStatus.cloud.description.github': 'Use OpenAI models hosted on GitHub infrastructure.',
  'settingsStatus.cloud.description.openai': 'Use GPT-4, GPT-3.5, and other OpenAI models.',
  'settingsStatus.cloud.description.custom': 'Configure a custom endpoint for this provider.',
  'settingsStatus.cloud.description.standard': 'Standard AI provider integration.',
  'settingsStatus.cloud.logo': '{provider} logo',
  'settingsStatus.cloud.toggle': 'Enable {provider}',
  'settingsStatus.cloud.enabled': '{provider} enabled.',
  'settingsStatus.cloud.disabled': '{provider} disabled.',
  'settingsStatus.cloud.baseUrlInput': '{provider} base URL',
  'settingsStatus.cloud.baseUrlPlaceholder': 'Enter the {provider} base URL',
  'settingsStatus.cloud.editBaseUrl': 'Edit the base URL for {provider}',
  'settingsStatus.cloud.setBaseUrl': 'Set the base URL',
  'settingsStatus.cloud.baseUrlUpdated': '{provider} base URL updated.',
  'settingsStatus.cloud.environmentUrl': 'URL set in the .env file',
  'settingsStatus.github.loading': 'Loading…',
  'settingsStatus.github.refreshing': 'Refreshing…',
  'settingsStatus.github.showDetails': 'Show details',
  'settingsStatus.github.hideDetails': 'Hide details',
  'settingsStatus.github.progress': 'Loading progress: {progress}%',
  'settingsStatus.github.steps': 'Loading steps',
  'settingsStatus.github.stepCompleted': 'Completed',
  'settingsStatus.github.stepFailed': 'Failed',
  'settingsStatus.github.stepLoading': 'In progress',
  'settingsStatus.github.stepPending': 'Pending',
  'settingsStatus.github.loadFailed': 'Unable to load this GitHub section',
  'settingsStatus.github.safeError': 'GitHub data is temporarily unavailable. Please try again.',
  'settingsStatus.github.retry': 'Try again',
  'settingsStatus.github.refresh': 'Refresh',
  'settingsStatus.service.loading': 'Checking service status…',
  'settingsStatus.service.errorTitle': 'Service diagnostics are unavailable',
  'settingsStatus.service.errorDescription':
    'The diagnostics endpoints could not be reached. Please try again shortly.',
  'settingsStatus.service.emptyTitle': 'No service endpoints available',
  'settingsStatus.service.emptyDescription': 'There are currently no service endpoints to report.',
  'settingsStatus.service.retry': 'Try again',
  'settingsStatus.service.refresh': 'Refresh service status',
  'settingsStatus.service.list': 'Service diagnostics',
  'settingsStatus.service.available': 'Available',
  'settingsStatus.service.unavailable': 'Unavailable',
  'settingsStatus.service.httpStatus': 'HTTP {status}',
  'settingsStatus.service.noResponse': 'No HTTP response',
  'settingsStatus.service.latency': '{value} ms',
  'settingsStatus.service.result': '{endpoint}: {state}, {status}, {latency}',
  'settingsStatus.task.title': 'Browser storage',
  'settingsStatus.task.entries.one': '{count} local storage entry',
  'settingsStatus.task.entries.other': '{count} local storage entries',
  'settingsStatus.task.clear': 'Clear temporary data',
  'settingsStatus.task.cleared': 'Temporary data cleared.',
  'settingsStatus.task.clearFailed': 'Temporary data could not be cleared. Please try again.',
  'settingsStatus.task.errorTitle': 'Browser storage is unavailable',
  'settingsStatus.task.errorDescription':
    'E-Code cannot access local browser storage. Check your browser settings and try again.',
  'settingsStatus.task.retry': 'Try again',
  'settingsStatus.task.emptyTitle': 'Browser storage is empty',
  'settingsStatus.task.emptyDescription': 'No local storage entries are currently stored by this browser.',
  'settingsStatus.task.list': 'Local storage entries',
  'settingsStatus.task.entrySize': '{key}: {size}',
} as const;

export type SettingsStatusSurfacesKey = keyof typeof settingsStatusSurfacesEn;
export type SettingsStatusSurfacesCopy = Readonly<Record<SettingsStatusSurfacesKey, string>>;

export const settingsStatusSurfacesFr: SettingsStatusSurfacesCopy = {
  'settingsStatus.cloud.title': 'Fournisseurs cloud',
  'settingsStatus.cloud.description': 'Connectez des modèles et services d’IA hébergés dans le cloud.',
  'settingsStatus.cloud.enableAll': 'Activer tous les fournisseurs cloud',
  'settingsStatus.cloud.allEnabled': 'Tous les fournisseurs cloud sont activés.',
  'settingsStatus.cloud.allDisabled': 'Tous les fournisseurs cloud sont désactivés.',
  'settingsStatus.cloud.loading': 'Chargement des fournisseurs cloud…',
  'settingsStatus.cloud.loadErrorTitle': 'Impossible de charger les fournisseurs cloud',
  'settingsStatus.cloud.loadErrorDescription':
    'Les paramètres des fournisseurs sont temporairement indisponibles. Veuillez réessayer.',
  'settingsStatus.cloud.retry': 'Réessayer',
  'settingsStatus.cloud.emptyTitle': 'Aucun fournisseur cloud disponible',
  'settingsStatus.cloud.emptyDescription':
    'Aucun fournisseur cloud compatible n’est encore configuré pour cet espace de travail.',
  'settingsStatus.cloud.configurable': 'Configurable',
  'settingsStatus.cloud.description.anthropic': 'Accédez à Claude et aux autres modèles Anthropic.',
  'settingsStatus.cloud.description.github': 'Utilisez les modèles OpenAI hébergés sur l’infrastructure GitHub.',
  'settingsStatus.cloud.description.openai': 'Utilisez GPT-4, GPT-3.5 et les autres modèles OpenAI.',
  'settingsStatus.cloud.description.custom': 'Configurez un point de terminaison personnalisé pour ce fournisseur.',
  'settingsStatus.cloud.description.standard': 'Intégration standard d’un fournisseur d’IA.',
  'settingsStatus.cloud.logo': 'Logo de {provider}',
  'settingsStatus.cloud.toggle': 'Activer {provider}',
  'settingsStatus.cloud.enabled': '{provider} est activé.',
  'settingsStatus.cloud.disabled': '{provider} est désactivé.',
  'settingsStatus.cloud.baseUrlInput': 'URL de base de {provider}',
  'settingsStatus.cloud.baseUrlPlaceholder': 'Saisissez l’URL de base de {provider}',
  'settingsStatus.cloud.editBaseUrl': 'Modifier l’URL de base de {provider}',
  'settingsStatus.cloud.setBaseUrl': 'Définir l’URL de base',
  'settingsStatus.cloud.baseUrlUpdated': 'L’URL de base de {provider} a été mise à jour.',
  'settingsStatus.cloud.environmentUrl': 'URL définie dans le fichier .env',
  'settingsStatus.github.loading': 'Chargement…',
  'settingsStatus.github.refreshing': 'Actualisation…',
  'settingsStatus.github.showDetails': 'Afficher les détails',
  'settingsStatus.github.hideDetails': 'Masquer les détails',
  'settingsStatus.github.progress': 'Progression du chargement : {progress} %',
  'settingsStatus.github.steps': 'Étapes du chargement',
  'settingsStatus.github.stepCompleted': 'Terminée',
  'settingsStatus.github.stepFailed': 'Échec',
  'settingsStatus.github.stepLoading': 'En cours',
  'settingsStatus.github.stepPending': 'En attente',
  'settingsStatus.github.loadFailed': 'Impossible de charger cette section GitHub',
  'settingsStatus.github.safeError': 'Les données GitHub sont temporairement indisponibles. Veuillez réessayer.',
  'settingsStatus.github.retry': 'Réessayer',
  'settingsStatus.github.refresh': 'Actualiser',
  'settingsStatus.service.loading': 'Vérification de l’état des services…',
  'settingsStatus.service.errorTitle': 'Les diagnostics des services sont indisponibles',
  'settingsStatus.service.errorDescription':
    'Impossible de joindre les points de terminaison de diagnostic. Veuillez réessayer dans quelques instants.',
  'settingsStatus.service.emptyTitle': 'Aucun point de terminaison disponible',
  'settingsStatus.service.emptyDescription': 'Aucun point de terminaison de service n’est actuellement disponible.',
  'settingsStatus.service.retry': 'Réessayer',
  'settingsStatus.service.refresh': 'Actualiser l’état des services',
  'settingsStatus.service.list': 'Diagnostics des services',
  'settingsStatus.service.available': 'Disponible',
  'settingsStatus.service.unavailable': 'Indisponible',
  'settingsStatus.service.httpStatus': 'HTTP {status}',
  'settingsStatus.service.noResponse': 'Aucune réponse HTTP',
  'settingsStatus.service.latency': '{value} ms',
  'settingsStatus.service.result': '{endpoint} : {state}, {status}, {latency}',
  'settingsStatus.task.title': 'Stockage du navigateur',
  'settingsStatus.task.entries.one': '{count} entrée dans le stockage local',
  'settingsStatus.task.entries.other': '{count} entrées dans le stockage local',
  'settingsStatus.task.clear': 'Effacer les données temporaires',
  'settingsStatus.task.cleared': 'Les données temporaires ont été effacées.',
  'settingsStatus.task.clearFailed': 'Impossible d’effacer les données temporaires. Veuillez réessayer.',
  'settingsStatus.task.errorTitle': 'Le stockage du navigateur est indisponible',
  'settingsStatus.task.errorDescription':
    'E-Code ne peut pas accéder au stockage local du navigateur. Vérifiez les paramètres de votre navigateur, puis réessayez.',
  'settingsStatus.task.retry': 'Réessayer',
  'settingsStatus.task.emptyTitle': 'Le stockage du navigateur est vide',
  'settingsStatus.task.emptyDescription':
    'Aucune entrée de stockage local n’est actuellement enregistrée par ce navigateur.',
  'settingsStatus.task.list': 'Entrées du stockage local',
  'settingsStatus.task.entrySize': '{key} : {size}',
};

export function getSettingsStatusSurfacesCopy(language?: string | null): SettingsStatusSurfacesCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? settingsStatusSurfacesFr : settingsStatusSurfacesEn;
}

export function formatSettingsStatusSurfacesCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatSettingsStatusNumber(value: number, language?: string | null): string {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;

  return new Intl.NumberFormat(normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US').format(safeValue);
}

export function formatSettingsStatusEntryCount(count: number, language?: string | null): string {
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  const locale = normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
  const copy = getSettingsStatusSurfacesCopy(language);
  const suffix = new Intl.PluralRules(locale).select(safeCount) === 'one' ? 'one' : 'other';

  return formatSettingsStatusSurfacesCopy(copy[`settingsStatus.task.entries.${suffix}`], {
    count: formatSettingsStatusNumber(safeCount, language),
  });
}

export function formatSettingsStatusBytes(bytes: number, language?: string | null): string {
  const safeBytes = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const isFrench = normalizeSupportedLanguage(language) === 'fr';
  const units = isFrench ? ['o', 'Ko', 'Mo', 'Go'] : ['B', 'KB', 'MB', 'GB'];

  if (safeBytes === 0) {
    return `0\u00a0${units[0]}`;
  }

  const exponent = Math.min(Math.floor(Math.log(safeBytes) / Math.log(1024)), units.length - 1);
  const value = safeBytes / 1024 ** exponent;

  const formatted = new Intl.NumberFormat(isFrench ? 'fr-FR' : 'en-US', {
    minimumFractionDigits: exponent === 0 ? 0 : 1,
    maximumFractionDigits: exponent === 0 ? 0 : 1,
  }).format(value);

  return `${formatted}\u00a0${units[exponent]}`;
}
