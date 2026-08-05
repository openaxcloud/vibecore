import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export const desktopSettingsEn = {
  'desktopSettings.metaTitle': 'Desktop settings - E-Code',
  'desktopSettings.title': 'Desktop settings',
  'desktopSettings.description': 'Configure native app, network and device preferences.',
  'desktopSettings.status.checking': 'Checking the desktop app…',
  'desktopSettings.status.openAppSettings': 'Open this page in the E-Code desktop app to change native settings.',
  'desktopSettings.status.loading': 'Loading desktop settings…',
  'desktopSettings.status.loaded': 'Desktop settings loaded.',
  'desktopSettings.status.loadFailed': 'Desktop settings could not load. Try again.',
  'desktopSettings.status.saved': 'Desktop settings saved.',
  'desktopSettings.status.saveFailed': 'Desktop settings could not be saved. Try again.',
  'desktopSettings.status.openAppNotification':
    'Open this page in the E-Code desktop app to test native notifications.',
  'desktopSettings.status.notificationSent': 'Test notification sent.',
  'desktopSettings.status.notificationFailed':
    'The test notification could not be sent. Check system permissions and try again.',
  'desktopSettings.status.openAppFolder': 'Open this page in the E-Code desktop app to choose a local folder.',
  'desktopSettings.status.folderSelected': 'Folder selected.',
  'desktopSettings.status.folderCanceled': 'Folder selection canceled.',
  'desktopSettings.status.folderFailed': 'The folder picker could not open. Try again.',
  'desktopSettings.notification.title': 'E-Code',
  'desktopSettings.notification.body': 'Native notifications are enabled.',
  'desktopSettings.loading.label': 'Loading desktop settings',
  'desktopSettings.error.title': 'Desktop settings could not load',
  'desktopSettings.error.description':
    'The native settings are hidden because the desktop app did not respond. No setting was changed.',
  'desktopSettings.unavailable.title': 'Available in the E-Code desktop app',
  'desktopSettings.unavailable.description':
    'Proxy, tray, notifications and device management are native controls. Open this page inside the E-Code desktop app to configure them.',
  'desktopSettings.unavailable.action': 'Get the desktop app',
  'desktopSettings.stats.connection.label': 'Desktop connection',
  'desktopSettings.stats.connection.value': 'Connected',
  'desktopSettings.stats.connection.detail': 'Native features available',
  'desktopSettings.stats.storage.label': 'Token storage',
  'desktopSettings.stats.storage.protected': 'Protected',
  'desktopSettings.stats.storage.limited': 'Limited',
  'desktopSettings.stats.storage.encrypted': 'Encrypted session storage',
  'desktopSettings.stats.storage.unavailable': 'System protection unavailable',
  'desktopSettings.stats.session.label': 'Session',
  'desktopSettings.stats.session.signedIn': 'Signed in',
  'desktopSettings.stats.session.notStored': 'Not stored',
  'desktopSettings.stats.session.detail': 'SaaS login state',
  'desktopSettings.proxy.title': 'Proxy',
  'desktopSettings.proxy.mode': 'Mode',
  'desktopSettings.proxy.system': 'System',
  'desktopSettings.proxy.direct': 'Direct',
  'desktopSettings.proxy.manual': 'Manual',
  'desktopSettings.proxy.server': 'Manual server',
  'desktopSettings.proxy.serverPlaceholder': 'http://proxy.example.com:8080',
  'desktopSettings.native.title': 'Native features',
  'desktopSettings.native.disableTray': 'Disable tray',
  'desktopSettings.native.enableTray': 'Enable tray',
  'desktopSettings.native.testNotification': 'Test notification',
  'desktopSettings.native.openFolder': 'Open local folder',
  'desktopSettings.device.title': 'Device management',
  'desktopSettings.device.managedDescription': 'Your organization manages selected desktop settings on this device.',
  'desktopSettings.device.personalDescription': 'This device uses your personal E-Code desktop settings.',
  'desktopSettings.device.management': 'Management',
  'desktopSettings.device.organizationManaged': 'Organization managed',
  'desktopSettings.device.personal': 'Personal',
} as const;

export type DesktopSettingsKey = keyof typeof desktopSettingsEn;
export type DesktopSettingsCopy = Readonly<Record<DesktopSettingsKey, string>>;

export const desktopSettingsFr: DesktopSettingsCopy = {
  'desktopSettings.metaTitle': 'Paramètres de l’application de bureau - E-Code',
  'desktopSettings.title': 'Paramètres de l’application de bureau',
  'desktopSettings.description': 'Configurez l’application native, le réseau et les préférences de l’appareil.',
  'desktopSettings.status.checking': 'Vérification de l’application de bureau…',
  'desktopSettings.status.openAppSettings':
    'Ouvrez cette page dans l’application de bureau E-Code pour modifier les paramètres natifs.',
  'desktopSettings.status.loading': 'Chargement des paramètres de l’application de bureau…',
  'desktopSettings.status.loaded': 'Paramètres de l’application de bureau chargés.',
  'desktopSettings.status.loadFailed': 'Impossible de charger les paramètres de l’application de bureau. Réessayez.',
  'desktopSettings.status.saved': 'Paramètres de l’application de bureau enregistrés.',
  'desktopSettings.status.saveFailed': 'Impossible d’enregistrer les paramètres de l’application de bureau. Réessayez.',
  'desktopSettings.status.openAppNotification':
    'Ouvrez cette page dans l’application de bureau E-Code pour tester les notifications natives.',
  'desktopSettings.status.notificationSent': 'Notification de test envoyée.',
  'desktopSettings.status.notificationFailed':
    'Impossible d’envoyer la notification de test. Vérifiez les autorisations système, puis réessayez.',
  'desktopSettings.status.openAppFolder':
    'Ouvrez cette page dans l’application de bureau E-Code pour choisir un dossier local.',
  'desktopSettings.status.folderSelected': 'Dossier sélectionné.',
  'desktopSettings.status.folderCanceled': 'Sélection du dossier annulée.',
  'desktopSettings.status.folderFailed': 'Impossible d’ouvrir le sélecteur de dossier. Réessayez.',
  'desktopSettings.notification.title': 'E-Code',
  'desktopSettings.notification.body': 'Les notifications natives sont activées.',
  'desktopSettings.loading.label': 'Chargement des paramètres de l’application de bureau',
  'desktopSettings.error.title': 'Impossible de charger les paramètres de l’application de bureau',
  'desktopSettings.error.description':
    'Les paramètres natifs sont masqués, car l’application de bureau n’a pas répondu. Aucun paramètre n’a été modifié.',
  'desktopSettings.unavailable.title': 'Disponible dans l’application de bureau E-Code',
  'desktopSettings.unavailable.description':
    'Le proxy, la zone de notification, les notifications et la gestion de l’appareil sont des commandes natives. Ouvrez cette page dans l’application de bureau E-Code pour les configurer.',
  'desktopSettings.unavailable.action': 'Obtenir l’application de bureau',
  'desktopSettings.stats.connection.label': 'Connexion à l’application de bureau',
  'desktopSettings.stats.connection.value': 'Connectée',
  'desktopSettings.stats.connection.detail': 'Fonctionnalités natives disponibles',
  'desktopSettings.stats.storage.label': 'Stockage du jeton',
  'desktopSettings.stats.storage.protected': 'Protégé',
  'desktopSettings.stats.storage.limited': 'Limité',
  'desktopSettings.stats.storage.encrypted': 'Stockage de session chiffré',
  'desktopSettings.stats.storage.unavailable': 'Protection système indisponible',
  'desktopSettings.stats.session.label': 'Session',
  'desktopSettings.stats.session.signedIn': 'Connectée',
  'desktopSettings.stats.session.notStored': 'Non stockée',
  'desktopSettings.stats.session.detail': 'État de connexion au SaaS',
  'desktopSettings.proxy.title': 'Proxy',
  'desktopSettings.proxy.mode': 'Mode',
  'desktopSettings.proxy.system': 'Système',
  'desktopSettings.proxy.direct': 'Direct',
  'desktopSettings.proxy.manual': 'Manuel',
  'desktopSettings.proxy.server': 'Serveur manuel',
  'desktopSettings.proxy.serverPlaceholder': 'http://proxy.example.com:8080',
  'desktopSettings.native.title': 'Fonctionnalités natives',
  'desktopSettings.native.disableTray': 'Désactiver la zone de notification',
  'desktopSettings.native.enableTray': 'Activer la zone de notification',
  'desktopSettings.native.testNotification': 'Tester la notification',
  'desktopSettings.native.openFolder': 'Ouvrir un dossier local',
  'desktopSettings.device.title': 'Gestion de l’appareil',
  'desktopSettings.device.managedDescription':
    'Votre organisation gère certains paramètres de l’application de bureau sur cet appareil.',
  'desktopSettings.device.personalDescription':
    'Cet appareil utilise vos paramètres personnels de l’application de bureau E-Code.',
  'desktopSettings.device.management': 'Gestion',
  'desktopSettings.device.organizationManaged': 'Géré par l’organisation',
  'desktopSettings.device.personal': 'Personnel',
};

export type DesktopSettingsLanguage = MarketingLanguage;

export function getDesktopSettingsCopy(language?: string | null): DesktopSettingsCopy {
  return resolveMarketingLanguage(language) === 'fr' ? desktopSettingsFr : desktopSettingsEn;
}

export function resolveDesktopSettingsLanguage(language?: string | null): DesktopSettingsLanguage {
  return resolveMarketingLanguage(language);
}
