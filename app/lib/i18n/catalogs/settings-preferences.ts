import { resolveMarketingLanguage } from './marketing';

export const settingsPreferencesEn = {
  'settingsPreferences.title': 'Preferences',
  'settingsPreferences.language': 'Language',
  'settingsPreferences.notifications': 'Notifications',
  'settingsPreferences.notifications.enabled': 'Notifications are enabled',
  'settingsPreferences.notifications.disabled': 'Notifications are disabled',
  'settingsPreferences.notifications.toggle': 'Enable notifications',
  'settingsPreferences.time.title': 'Time settings',
  'settingsPreferences.timezone': 'Time zone',
  'settingsPreferences.shortcuts.title': 'Keyboard shortcuts',
  'settingsPreferences.theme.title': 'Toggle theme',
  'settingsPreferences.theme.description': 'Switch between light and dark mode.',
  'settingsPreferences.theme.action': 'Switch light/dark theme',
  'settingsPreferences.toast.updated': 'Settings updated',
  'settingsPreferences.toast.savedLocally': 'Settings saved locally',
  'settingsPreferences.toast.syncFailed': 'Could not sync settings',
  'settingsPreferences.toast.updateFailed': 'Could not update settings',
} as const;

export type SettingsPreferencesKey = keyof typeof settingsPreferencesEn;
export type SettingsPreferencesCopy = Readonly<Record<SettingsPreferencesKey, string>>;

export const settingsPreferencesFr: SettingsPreferencesCopy = {
  'settingsPreferences.title': 'Préférences',
  'settingsPreferences.language': 'Langue',
  'settingsPreferences.notifications': 'Notifications',
  'settingsPreferences.notifications.enabled': 'Les notifications sont activées',
  'settingsPreferences.notifications.disabled': 'Les notifications sont désactivées',
  'settingsPreferences.notifications.toggle': 'Activer les notifications',
  'settingsPreferences.time.title': 'Paramètres horaires',
  'settingsPreferences.timezone': 'Fuseau horaire',
  'settingsPreferences.shortcuts.title': 'Raccourcis clavier',
  'settingsPreferences.theme.title': 'Changer de thème',
  'settingsPreferences.theme.description': 'Basculez entre les modes clair et sombre.',
  'settingsPreferences.theme.action': 'Basculer entre les thèmes clair et sombre',
  'settingsPreferences.toast.updated': 'Paramètres mis à jour',
  'settingsPreferences.toast.savedLocally': 'Paramètres enregistrés localement',
  'settingsPreferences.toast.syncFailed': 'Impossible de synchroniser les paramètres',
  'settingsPreferences.toast.updateFailed': 'Impossible de mettre à jour les paramètres',
};

export function getSettingsPreferencesCopy(language?: string | null): SettingsPreferencesCopy {
  return resolveMarketingLanguage(language) === 'fr' ? settingsPreferencesFr : settingsPreferencesEn;
}
