import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const errorSurfacesEn = {
  'panelBoundary.title.app': 'The application encountered an error',
  'panelBoundary.title.zone': 'This area encountered an error',
  'panelBoundary.title.panel': 'This panel encountered an error',
  'panelBoundary.body': 'The error was isolated so the rest of the workspace can keep running.',
  'panelBoundary.retrying': 'One automatic recovery attempt is in progress…',
  'panelBoundary.reload.app': 'Reload application',
  'panelBoundary.reload.zone': 'Reload area',
  'panelBoundary.reload.panel': 'Reload panel',
  'panelBoundary.report': 'Report bug',
  'panelBoundary.reported': 'Bug report logged',
  'panelBoundary.loading': 'Preparing panels, runtime signals, and workspace data.',
  'loadingOverlay.default': 'Loading…',
  'chatAlert.preview.title': 'Preview error',
  'chatAlert.terminal.title': 'Terminal error',
  'chatAlert.preview.message':
    'An error occurred while running the preview. E-Code can analyze it and help you resolve it.',
  'chatAlert.terminal.message':
    'An error occurred while running terminal commands. E-Code can analyze it and help you resolve it.',
  'chatAlert.details': 'Technical details',
  'chatAlert.askAgent': 'Ask the agent',
  'chatAlert.dismiss': 'Dismiss',
  'chatAlert.prompt.preview': '*Fix this preview error*\n```js\n{content}\n```\n',
  'chatAlert.prompt.terminal': '*Fix this terminal error*\n```sh\n{content}\n```\n',
} as const;

export type ErrorSurfacesKey = keyof typeof errorSurfacesEn;
export type ErrorSurfacesCopy = Readonly<Record<ErrorSurfacesKey, string>>;

export const errorSurfacesFr: ErrorSurfacesCopy = {
  'panelBoundary.title.app': 'L’application a rencontré une erreur',
  'panelBoundary.title.zone': 'Cette zone a rencontré une erreur',
  'panelBoundary.title.panel': 'Ce panneau a rencontré une erreur',
  'panelBoundary.body':
    'L’erreur a été isolée afin que le reste de l’espace de travail puisse continuer à fonctionner.',
  'panelBoundary.retrying': 'Une tentative de récupération automatique est en cours…',
  'panelBoundary.reload.app': 'Recharger l’application',
  'panelBoundary.reload.zone': 'Recharger la zone',
  'panelBoundary.reload.panel': 'Recharger le panneau',
  'panelBoundary.report': 'Signaler le bug',
  'panelBoundary.reported': 'Rapport de bug enregistré',
  'panelBoundary.loading':
    'Préparation des panneaux, des signaux de l’environnement d’exécution et des données de l’espace de travail.',
  'loadingOverlay.default': 'Chargement…',
  'chatAlert.preview.title': 'Erreur d’aperçu',
  'chatAlert.terminal.title': 'Erreur du terminal',
  'chatAlert.preview.message':
    'Une erreur est survenue pendant l’exécution de l’aperçu. E-Code peut l’analyser et vous aider à la résoudre.',
  'chatAlert.terminal.message':
    'Une erreur est survenue pendant l’exécution des commandes du terminal. E-Code peut l’analyser et vous aider à la résoudre.',
  'chatAlert.details': 'Détails techniques',
  'chatAlert.askAgent': 'Demander à l’agent',
  'chatAlert.dismiss': 'Fermer',
  'chatAlert.prompt.preview': '*Corrige cette erreur d’aperçu*\n```js\n{content}\n```\n',
  'chatAlert.prompt.terminal': '*Corrige cette erreur du terminal*\n```sh\n{content}\n```\n',
};

export function getErrorSurfacesCopy(language?: string | null): ErrorSurfacesCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? errorSurfacesFr : errorSurfacesEn;
}

export function formatErrorSurfacesCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
