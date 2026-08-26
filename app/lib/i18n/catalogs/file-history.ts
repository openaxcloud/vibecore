import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export type FileHistorySource = 'initial' | 'save' | 'agent' | 'restore' | 'external' | 'conflict' | 'recovery';

export const fileHistoryEn = {
  'fileHistory.dialogLabel': 'File history for {fileName}',
  'fileHistory.title': 'History — {fileName}',
  'fileHistory.subtitle': 'Independent of Git · append-only versions',
  'fileHistory.close': 'Close file history',
  'fileHistory.loading': 'Loading history…',
  'fileHistory.error': 'The file history could not be loaded.',
  'fileHistory.retry': 'Retry',
  'fileHistory.empty': 'No history yet. Edit and save this file to start capturing versions.',
  'fileHistory.versionCounter': 'Version {current} / {total}',
  'fileHistory.versionValue': 'Version {current} of {total}',
  'fileHistory.source.initial': 'Baseline',
  'fileHistory.source.save': 'Saved',
  'fileHistory.source.agent': 'Agent',
  'fileHistory.source.restore': 'Restored',
  'fileHistory.source.external': 'External',
  'fileHistory.source.conflict': 'Recovered conflict edit',
  'fileHistory.source.recovery': 'Recovered unsaved edit',
  'fileHistory.dateUnavailable': 'Date unavailable',
  'fileHistory.latest': 'Latest',
  'fileHistory.previous': 'Previous version',
  'fileHistory.next': 'Next version',
  'fileHistory.slider': 'File version',
  'fileHistory.pausePlayback': 'Pause playback',
  'fileHistory.playHistory': 'Play version history',
  'fileHistory.pause': 'Pause',
  'fileHistory.play': 'Play',
  'fileHistory.playbackSpeed': 'Playback speed',
  'fileHistory.compareLatest': 'Compare with latest',
  'fileHistory.restoring': 'Restoring…',
  'fileHistory.restore': 'Restore this version',
  'fileHistory.identical': 'This version is identical to the latest.',
} as const;

export type FileHistoryKey = keyof typeof fileHistoryEn;
export type FileHistoryCopy = Readonly<Record<FileHistoryKey, string>>;

export const fileHistoryFr: FileHistoryCopy = {
  'fileHistory.dialogLabel': 'Historique du fichier {fileName}',
  'fileHistory.title': 'Historique — {fileName}',
  'fileHistory.subtitle': 'Indépendant de Git · versions ajoutées chronologiquement',
  'fileHistory.close': 'Fermer l’historique du fichier',
  'fileHistory.loading': 'Chargement de l’historique…',
  'fileHistory.error': 'Impossible de charger l’historique du fichier.',
  'fileHistory.retry': 'Réessayer',
  'fileHistory.empty':
    'Aucun historique pour le moment. Modifiez et enregistrez ce fichier pour commencer à créer des versions.',
  'fileHistory.versionCounter': 'Version {current} / {total}',
  'fileHistory.versionValue': 'Version {current} sur {total}',
  'fileHistory.source.initial': 'Référence initiale',
  'fileHistory.source.save': 'Enregistrée',
  'fileHistory.source.agent': 'Agent',
  'fileHistory.source.restore': 'Restaurée',
  'fileHistory.source.external': 'Externe',
  'fileHistory.source.conflict': 'Édition récupérée après conflit',
  'fileHistory.source.recovery': 'Édition non enregistrée récupérée',
  'fileHistory.dateUnavailable': 'Date indisponible',
  'fileHistory.latest': 'Dernière version',
  'fileHistory.previous': 'Version précédente',
  'fileHistory.next': 'Version suivante',
  'fileHistory.slider': 'Version du fichier',
  'fileHistory.pausePlayback': 'Suspendre la lecture',
  'fileHistory.playHistory': 'Lire l’historique des versions',
  'fileHistory.pause': 'Pause',
  'fileHistory.play': 'Lire',
  'fileHistory.playbackSpeed': 'Vitesse de lecture',
  'fileHistory.compareLatest': 'Comparer à la dernière version',
  'fileHistory.restoring': 'Restauration…',
  'fileHistory.restore': 'Restaurer cette version',
  'fileHistory.identical': 'Cette version est identique à la dernière.',
};

export function resolveFileHistoryLanguage(language?: string | null): MarketingLanguage {
  return resolveMarketingLanguage(language);
}

export function getFileHistoryCopy(language?: string | null): FileHistoryCopy {
  return resolveFileHistoryLanguage(language) === 'fr' ? fileHistoryFr : fileHistoryEn;
}

export function formatFileHistoryCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatFileHistoryNumber(value: number, language?: string | null): string {
  return new Intl.NumberFormat(resolveFileHistoryLanguage(language) === 'fr' ? 'fr-FR' : 'en-US').format(value);
}

export function formatFileHistoryTimestamp(timestamp: number, language?: string | null): string | null {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(resolveFileHistoryLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export function fileHistorySourceLabel(source: FileHistorySource, copy: FileHistoryCopy): string {
  return copy[`fileHistory.source.${source}`];
}
