import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const collaborationRuntimeEn = {
  'collaborationRuntime.unavailable': 'Realtime collaboration is not available in this browser.',
  'collaborationRuntime.connectionFailed': 'Could not connect to realtime collaboration. Reconnecting…',
  'collaborationRuntime.timeout': 'Realtime collaboration took too long to connect. Reconnecting…',
  'collaborationRuntime.invalidEvent': 'Realtime collaboration received an invalid update. Reconnecting…',
  'collaborationRuntime.socketError': 'Realtime collaboration was interrupted. Reconnecting…',
} as const;

export type CollaborationRuntimeKey = keyof typeof collaborationRuntimeEn;
export type CollaborationRuntimeCopy = Readonly<Record<CollaborationRuntimeKey, string>>;

export const collaborationRuntimeFr: CollaborationRuntimeCopy = {
  'collaborationRuntime.unavailable': 'La collaboration en temps réel n’est pas disponible dans ce navigateur.',
  'collaborationRuntime.connectionFailed': 'Impossible de se connecter à la collaboration en temps réel. Reconnexion…',
  'collaborationRuntime.timeout': 'La connexion à la collaboration en temps réel a pris trop de temps. Reconnexion…',
  'collaborationRuntime.invalidEvent': 'La collaboration en temps réel a reçu une mise à jour invalide. Reconnexion…',
  'collaborationRuntime.socketError': 'La collaboration en temps réel a été interrompue. Reconnexion…',
};

export function getCollaborationRuntimeCopy(language?: string | null): CollaborationRuntimeCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? collaborationRuntimeFr : collaborationRuntimeEn;
}
