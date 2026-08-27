export const mobileCopyEn = {
  documentTitle: 'E-Code Mobile',
  titleProjects: 'Projects',
  titleProjectIde: 'Project IDE',
  titleNotifications: 'Notifications',
  titleSettings: 'Settings',
  titleDashboard: 'Dashboard',
  shareButton: 'Share',
  shareButtonLabel: 'Share project link',
  openButton: 'Open',
  openButtonLabel: 'Open in browser',
  languageSwitchLabel: 'Switch to French',
  languageButtonTarget: 'FR',
  offline: 'Offline. Edits stay in the web workspace cache until the connection returns.',
  configMissingTitle: 'Mobile origin required',
  configMissingDescription: 'Set VITE_WEB_APP_ORIGIN to the deployed E-Code web app before building the native app.',
  frameTitle: 'E-Code web app',
  navigationLabel: 'Mobile workspace sections',
  navigationLogin: 'Login',
  navigationOnboarding: 'Onboarding',
  navigationDashboard: 'Dashboard',
  navigationProjects: 'Projects',
  navigationAlerts: 'Alerts',
  navigationSettings: 'Settings',
  versionLoading: 'Version loading',
  upload: 'Upload',
  uploadFailed: 'The file could not be uploaded. Check your connection and try again.',
  webPlatform: 'web',
  shareTitle: 'E-Code project',
  shareText: 'Open project {projectId} on E-Code',
  shareDialogTitle: 'Share project',
} as const;

export type MobileCopy = Readonly<Record<keyof typeof mobileCopyEn, string>>;

export const mobileCopyFr: MobileCopy = {
  documentTitle: 'E-Code mobile',
  titleProjects: 'Projets',
  titleProjectIde: 'IDE du projet',
  titleNotifications: 'Notifications',
  titleSettings: 'Paramètres',
  titleDashboard: 'Tableau de bord',
  shareButton: 'Partager',
  shareButtonLabel: 'Partager le lien du projet',
  openButton: 'Ouvrir',
  openButtonLabel: 'Ouvrir dans le navigateur',
  languageSwitchLabel: 'Passer à l’anglais',
  languageButtonTarget: 'EN',
  offline:
    'Hors ligne. Les modifications restent dans le cache de l’espace de travail web jusqu’au rétablissement de la connexion.',
  configMissingTitle: 'Origine mobile requise',
  configMissingDescription:
    'Définissez VITE_WEB_APP_ORIGIN sur l’application web E-Code déployée avant de compiler l’application native.',
  frameTitle: 'Application web E-Code',
  navigationLabel: 'Sections de l’espace de travail mobile',
  navigationLogin: 'Connexion',
  navigationOnboarding: 'Prise en main',
  navigationDashboard: 'Tableau de bord',
  navigationProjects: 'Projets',
  navigationAlerts: 'Alertes',
  navigationSettings: 'Paramètres',
  versionLoading: 'Chargement de la version',
  upload: 'Importer',
  uploadFailed: 'Impossible d’importer le fichier. Vérifiez votre connexion, puis réessayez.',
  webPlatform: 'web',
  shareTitle: 'Projet E-Code',
  shareText: 'Ouvrir le projet {projectId} sur E-Code',
  shareDialogTitle: 'Partager le projet',
};

export type MobileLanguage = 'en' | 'fr';

const MANUAL_LANGUAGE_COOKIE = 'vibecore-lang';
const AUTOMATIC_LANGUAGE_COOKIE = 'vibecore-auto-lang';

function normalizeMobileLanguage(value?: string | null): MobileLanguage | undefined {
  const normalized = value?.trim().toLowerCase();

  if (normalized === 'fr' || normalized?.startsWith('fr-')) {
    return 'fr';
  }

  if (normalized === 'en' || normalized?.startsWith('en-')) {
    return 'en';
  }

  return undefined;
}

function readCookie(cookieHeader: string, name: string): string | undefined {
  const match = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  if (!match) {
    return undefined;
  }

  try {
    return decodeURIComponent(match.slice(name.length + 1));
  } catch {
    return match.slice(name.length + 1);
  }
}

export function detectMobileLanguage(
  cookieHeader = typeof document !== 'undefined' ? document.cookie : '',
  browserLanguage = typeof navigator !== 'undefined' ? navigator.language : 'en',
): MobileLanguage {
  return (
    normalizeMobileLanguage(readCookie(cookieHeader, MANUAL_LANGUAGE_COOKIE)) ??
    normalizeMobileLanguage(readCookie(cookieHeader, AUTOMATIC_LANGUAGE_COOKIE)) ??
    normalizeMobileLanguage(browserLanguage) ??
    'en'
  );
}

export function persistMobileLanguage(language: MobileLanguage, manual = true): void {
  if (typeof document === 'undefined') {
    return;
  }

  const cookieName = manual ? MANUAL_LANGUAGE_COOKIE : AUTOMATIC_LANGUAGE_COOKIE;
  document.cookie = `${cookieName}=${language}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function getMobileCopy(language?: string | null): MobileCopy {
  return language?.toLowerCase().startsWith('fr') ? mobileCopyFr : mobileCopyEn;
}

export function formatMobileCopy(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
