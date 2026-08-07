import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const settingsCoreEn = {
  'settingsCore.avatar.menu': 'Account menu',
  'settingsCore.avatar.menuFor': 'Account menu for {username}',
  'settingsCore.avatar.imageAlt': 'Profile picture',
  'settingsCore.avatar.imageAltFor': 'Profile picture for {username}',
  'settingsCore.avatar.guest': 'Guest user',
  'settingsCore.avatar.editProfile': 'Edit profile',
  'settingsCore.avatar.settings': 'Settings',
  'settingsCore.avatar.reportBug': 'Report a bug',
  'settingsCore.avatar.downloadDebugLog': 'Download debug log',
  'settingsCore.avatar.downloadingDebugLog': 'Downloading debug log…',
  'settingsCore.avatar.helpDocumentation': 'Help and documentation',
  'settingsCore.avatar.debugLogDownloaded': 'Debug log downloaded.',
  'settingsCore.avatar.debugLogDownloadFailed': 'The debug log could not be downloaded. Try again.',
  'settingsCore.panel.title': 'Control panel',
  'settingsCore.panel.tabManagement': 'Tab management',
  'settingsCore.panel.back': 'Back',
  'settingsCore.panel.close': 'Close settings',
  'settingsCore.panel.beta': 'BETA',
  'settingsCore.panel.loading': 'Loading settings…',
  'settingsCore.panel.repairing': 'Restoring settings tabs…',
  'settingsCore.panel.empty.title': 'No settings tabs are visible',
  'settingsCore.panel.empty.description': 'Restore the default tabs to continue configuring your workspace.',
  'settingsCore.panel.empty.action': 'Restore default tabs',
  'settingsCore.boundary.title': 'This section could not load',
  'settingsCore.boundary.description': 'Settings are temporarily unavailable. Your changes were not affected.',
  'settingsCore.boundary.retry': 'Retry',
  'settingsCore.tab.profile.label': 'Profile',
  'settingsCore.tab.profile.description': 'Manage your profile and account settings',
  'settingsCore.tab.settings.label': 'Settings',
  'settingsCore.tab.settings.description': 'Configure application preferences',
  'settingsCore.tab.notifications.label': 'Notifications',
  'settingsCore.tab.notifications.description': 'View and manage your notifications',
  'settingsCore.tab.features.label': 'Features',
  'settingsCore.tab.features.description': 'Explore new and upcoming features',
  'settingsCore.tab.data.label': 'Data management',
  'settingsCore.tab.data.description': 'Manage your data and storage',
  'settingsCore.tab.cloudProviders.label': 'Cloud providers',
  'settingsCore.tab.cloudProviders.description': 'Configure cloud AI providers and models',
  'settingsCore.tab.localProviders.label': 'Local providers',
  'settingsCore.tab.localProviders.description': 'Configure local AI providers and models',
  'settingsCore.tab.github.label': 'GitHub',
  'settingsCore.tab.github.description': 'Connect and manage the GitHub integration',
  'settingsCore.tab.gitlab.label': 'GitLab',
  'settingsCore.tab.gitlab.description': 'Connect and manage the GitLab integration',
  'settingsCore.tab.netlify.label': 'Netlify',
  'settingsCore.tab.netlify.description': 'Configure Netlify deployment settings',
  'settingsCore.tab.vercel.label': 'Vercel',
  'settingsCore.tab.vercel.description': 'Manage Vercel projects and deployments',
  'settingsCore.tab.supabase.label': 'Supabase',
  'settingsCore.tab.supabase.description': 'Set up the Supabase database connection',
  'settingsCore.tab.eventLogs.label': 'Event logs',
  'settingsCore.tab.eventLogs.description': 'View system events and logs',
  'settingsCore.tab.mcp.label': 'MCP servers',
  'settingsCore.tab.mcp.description': 'Configure Model Context Protocol (MCP) servers',
  'settingsCore.tab.connections.label': 'Connections',
  'settingsCore.tab.connections.description': 'Review service and provider connections',
  'settingsCore.tab.update.label': 'Updates',
  'settingsCore.tab.update.description': 'Check upstream updates and changes',
  'settingsCore.tab.debug.label': 'Debug',
  'settingsCore.tab.debug.description': 'Inspect runtime diagnostics',
  'settingsCore.tab.taskManager.label': 'Local data',
  'settingsCore.tab.taskManager.description': 'Inspect and clear local browser storage',
  'settingsCore.tab.serviceStatus.label': 'Service status',
  'settingsCore.tab.serviceStatus.description': 'Check application service endpoints',
  'settingsCore.tab.unavailable.label': 'Settings',
  'settingsCore.tab.unavailable.description': 'Configure this part of your workspace',
  'settingsCore.status.features.one': '{count} new feature to explore',
  'settingsCore.status.features.other': '{count} new features to explore',
  'settingsCore.status.notifications.one': '{count} unread notification',
  'settingsCore.status.notifications.other': '{count} unread notifications',
} as const;

export type SettingsCoreKey = keyof typeof settingsCoreEn;
export type SettingsCoreCopy = Readonly<Record<SettingsCoreKey, string>>;
export type SettingsCoreLanguage = 'en' | 'fr';

export const settingsCoreFr: SettingsCoreCopy = {
  'settingsCore.avatar.menu': 'Menu du compte',
  'settingsCore.avatar.menuFor': 'Menu du compte de {username}',
  'settingsCore.avatar.imageAlt': 'Photo de profil',
  'settingsCore.avatar.imageAltFor': 'Photo de profil de {username}',
  'settingsCore.avatar.guest': 'Utilisateur invité',
  'settingsCore.avatar.editProfile': 'Modifier le profil',
  'settingsCore.avatar.settings': 'Paramètres',
  'settingsCore.avatar.reportBug': 'Signaler un bug',
  'settingsCore.avatar.downloadDebugLog': 'Télécharger le journal de débogage',
  'settingsCore.avatar.downloadingDebugLog': 'Téléchargement du journal de débogage…',
  'settingsCore.avatar.helpDocumentation': 'Aide et documentation',
  'settingsCore.avatar.debugLogDownloaded': 'Journal de débogage téléchargé.',
  'settingsCore.avatar.debugLogDownloadFailed': 'Impossible de télécharger le journal de débogage. Réessayez.',
  'settingsCore.panel.title': 'Panneau de configuration',
  'settingsCore.panel.tabManagement': 'Gestion des onglets',
  'settingsCore.panel.back': 'Retour',
  'settingsCore.panel.close': 'Fermer les paramètres',
  'settingsCore.panel.beta': 'BÊTA',
  'settingsCore.panel.loading': 'Chargement des paramètres…',
  'settingsCore.panel.repairing': 'Restauration des onglets de paramètres…',
  'settingsCore.panel.empty.title': 'Aucun onglet de paramètres visible',
  'settingsCore.panel.empty.description':
    'Restaurez les onglets par défaut pour poursuivre la configuration de votre espace de travail.',
  'settingsCore.panel.empty.action': 'Restaurer les onglets par défaut',
  'settingsCore.boundary.title': 'Impossible de charger cette section',
  'settingsCore.boundary.description':
    'Les paramètres sont temporairement indisponibles. Vos modifications n’ont pas été affectées.',
  'settingsCore.boundary.retry': 'Réessayer',
  'settingsCore.tab.profile.label': 'Profil',
  'settingsCore.tab.profile.description': 'Gérez votre profil et les paramètres de votre compte',
  'settingsCore.tab.settings.label': 'Paramètres',
  'settingsCore.tab.settings.description': 'Configurez les préférences de l’application',
  'settingsCore.tab.notifications.label': 'Notifications',
  'settingsCore.tab.notifications.description': 'Consultez et gérez vos notifications',
  'settingsCore.tab.features.label': 'Fonctionnalités',
  'settingsCore.tab.features.description': 'Découvrez les fonctionnalités nouvelles et à venir',
  'settingsCore.tab.data.label': 'Gestion des données',
  'settingsCore.tab.data.description': 'Gérez vos données et votre espace de stockage',
  'settingsCore.tab.cloudProviders.label': 'Fournisseurs cloud',
  'settingsCore.tab.cloudProviders.description': 'Configurez les fournisseurs et modèles d’IA cloud',
  'settingsCore.tab.localProviders.label': 'Fournisseurs locaux',
  'settingsCore.tab.localProviders.description': 'Configurez les fournisseurs et modèles d’IA locaux',
  'settingsCore.tab.github.label': 'GitHub',
  'settingsCore.tab.github.description': 'Connectez et gérez l’intégration GitHub',
  'settingsCore.tab.gitlab.label': 'GitLab',
  'settingsCore.tab.gitlab.description': 'Connectez et gérez l’intégration GitLab',
  'settingsCore.tab.netlify.label': 'Netlify',
  'settingsCore.tab.netlify.description': 'Configurez les paramètres de déploiement Netlify',
  'settingsCore.tab.vercel.label': 'Vercel',
  'settingsCore.tab.vercel.description': 'Gérez les projets et déploiements Vercel',
  'settingsCore.tab.supabase.label': 'Supabase',
  'settingsCore.tab.supabase.description': 'Configurez la connexion à la base de données Supabase',
  'settingsCore.tab.eventLogs.label': 'Journaux d’événements',
  'settingsCore.tab.eventLogs.description': 'Consultez les événements et journaux système',
  'settingsCore.tab.mcp.label': 'Serveurs MCP',
  'settingsCore.tab.mcp.description': 'Configurez les serveurs Model Context Protocol (MCP)',
  'settingsCore.tab.connections.label': 'Connexions',
  'settingsCore.tab.connections.description': 'Consultez les connexions aux services et fournisseurs',
  'settingsCore.tab.update.label': 'Mises à jour',
  'settingsCore.tab.update.description': 'Consultez les mises à jour et changements en amont',
  'settingsCore.tab.debug.label': 'Débogage',
  'settingsCore.tab.debug.description': 'Consultez les diagnostics de l’environnement d’exécution',
  'settingsCore.tab.taskManager.label': 'Données locales',
  'settingsCore.tab.taskManager.description': 'Consultez et effacez le stockage local du navigateur',
  'settingsCore.tab.serviceStatus.label': 'État des services',
  'settingsCore.tab.serviceStatus.description': 'Vérifiez les points de terminaison des services de l’application',
  'settingsCore.tab.unavailable.label': 'Paramètres',
  'settingsCore.tab.unavailable.description': 'Configurez cette partie de votre espace de travail',
  'settingsCore.status.features.one': '{count} nouvelle fonctionnalité à découvrir',
  'settingsCore.status.features.other': '{count} nouvelles fonctionnalités à découvrir',
  'settingsCore.status.notifications.one': '{count} notification non lue',
  'settingsCore.status.notifications.other': '{count} notifications non lues',
};

const tabKeys = {
  profile: ['settingsCore.tab.profile.label', 'settingsCore.tab.profile.description'],
  settings: ['settingsCore.tab.settings.label', 'settingsCore.tab.settings.description'],
  notifications: ['settingsCore.tab.notifications.label', 'settingsCore.tab.notifications.description'],
  features: ['settingsCore.tab.features.label', 'settingsCore.tab.features.description'],
  data: ['settingsCore.tab.data.label', 'settingsCore.tab.data.description'],
  'cloud-providers': ['settingsCore.tab.cloudProviders.label', 'settingsCore.tab.cloudProviders.description'],
  'local-providers': ['settingsCore.tab.localProviders.label', 'settingsCore.tab.localProviders.description'],
  github: ['settingsCore.tab.github.label', 'settingsCore.tab.github.description'],
  gitlab: ['settingsCore.tab.gitlab.label', 'settingsCore.tab.gitlab.description'],
  netlify: ['settingsCore.tab.netlify.label', 'settingsCore.tab.netlify.description'],
  vercel: ['settingsCore.tab.vercel.label', 'settingsCore.tab.vercel.description'],
  supabase: ['settingsCore.tab.supabase.label', 'settingsCore.tab.supabase.description'],
  'event-logs': ['settingsCore.tab.eventLogs.label', 'settingsCore.tab.eventLogs.description'],
  mcp: ['settingsCore.tab.mcp.label', 'settingsCore.tab.mcp.description'],
  connections: ['settingsCore.tab.connections.label', 'settingsCore.tab.connections.description'],
  update: ['settingsCore.tab.update.label', 'settingsCore.tab.update.description'],
  debug: ['settingsCore.tab.debug.label', 'settingsCore.tab.debug.description'],
  'task-manager': ['settingsCore.tab.taskManager.label', 'settingsCore.tab.taskManager.description'],
  'service-status': ['settingsCore.tab.serviceStatus.label', 'settingsCore.tab.serviceStatus.description'],
} as const satisfies Readonly<Record<string, readonly [SettingsCoreKey, SettingsCoreKey]>>;

export function resolveSettingsCoreLanguage(language?: string | null): SettingsCoreLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

export function getSettingsCoreCopy(language?: string | null): SettingsCoreCopy {
  return resolveSettingsCoreLanguage(language) === 'fr' ? settingsCoreFr : settingsCoreEn;
}

export function formatSettingsCoreCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function getSettingsCoreTabLabel(tabId: string, language?: string | null): string {
  const copy = getSettingsCoreCopy(language);
  const keys = tabKeys[tabId as keyof typeof tabKeys];

  return copy[keys?.[0] ?? 'settingsCore.tab.unavailable.label'];
}

export function getSettingsCoreTabDescription(tabId: string, language?: string | null): string {
  const copy = getSettingsCoreCopy(language);
  const keys = tabKeys[tabId as keyof typeof tabKeys];

  return copy[keys?.[1] ?? 'settingsCore.tab.unavailable.description'];
}

export function formatSettingsCoreStatusMessage(tabId: string, count: number, language?: string | null): string {
  const resolvedLanguage = resolveSettingsCoreLanguage(language);
  const copy = getSettingsCoreCopy(resolvedLanguage);
  const formattedCount = new Intl.NumberFormat(resolvedLanguage === 'fr' ? 'fr-FR' : 'en-US').format(count);
  const plural = new Intl.PluralRules(resolvedLanguage === 'fr' ? 'fr-FR' : 'en-US').select(count);
  const suffix = plural === 'one' ? 'one' : 'other';

  const key =
    tabId === 'features'
      ? (`settingsCore.status.features.${suffix}` as const)
      : tabId === 'notifications'
        ? (`settingsCore.status.notifications.${suffix}` as const)
        : null;

  return key ? formatSettingsCoreCopy(copy[key], { count: formattedCount }) : '';
}
