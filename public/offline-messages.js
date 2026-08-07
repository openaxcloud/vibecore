(function registerOfflineMessages() {
  'use strict';

  const messages = Object.freeze({
    en: Object.freeze({
      documentTitle: 'E-Code — Offline',
      heading: 'You’re offline',
      subtitle: 'E-Code remains available for cached work.',
      explanation:
        'The network connection is unavailable. Cached projects and previously loaded resources remain accessible; online features will resume when the connection returns.',
      availableHeading: 'Available offline',
      cachedProjects: 'View and edit cached projects',
      loadedDocumentation: 'Open previously loaded documentation',
      localTools: 'Use local development tools',
      workspace: 'Continue coding in your workspace',
      retry: 'Try again',
      checking: 'Checking the connection…',
      restored: 'Connection restored. Reloading…',
      noConnection: 'No connection',
      stillOffline: 'Still offline. Check your connection and try again.',
      languageSwitch: 'Language',
      english: 'English',
      french: 'French',
      englishShort: 'EN',
      frenchShort: 'FR',
    }),
    fr: Object.freeze({
      documentTitle: 'E-Code — Hors ligne',
      heading: 'Vous êtes hors ligne',
      subtitle: 'E-Code reste disponible pour le travail mis en cache.',
      explanation:
        'La connexion réseau est indisponible. Les projets mis en cache et les ressources déjà chargées restent accessibles ; les fonctions en ligne reprendront au retour de la connexion.',
      availableHeading: 'Disponible hors ligne',
      cachedProjects: 'Consulter et modifier les projets mis en cache',
      loadedDocumentation: 'Ouvrir la documentation déjà chargée',
      localTools: 'Utiliser les outils de développement locaux',
      workspace: 'Continuer à coder dans votre espace de travail',
      retry: 'Réessayer',
      checking: 'Vérification de la connexion…',
      restored: 'Connexion rétablie. Rechargement…',
      noConnection: 'Aucune connexion',
      stillOffline: 'Vous êtes toujours hors ligne. Vérifiez votre connexion, puis réessayez.',
      languageSwitch: 'Langue',
      english: 'Anglais',
      french: 'Français',
      englishShort: 'EN',
      frenchShort: 'FR',
    }),
  });

  Object.defineProperty(window, '__ECODE_OFFLINE_MESSAGES__', {
    configurable: false,
    enumerable: false,
    value: messages,
    writable: false,
  });
})();
