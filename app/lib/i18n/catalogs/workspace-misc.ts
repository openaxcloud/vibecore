import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const workspaceMiscEn = {
  'workspaceMisc.floatingPane.aria': 'Floating pane: {title}',
  'workspaceMisc.floatingPane.dock.aria': 'Dock pane',
  'workspaceMisc.floatingPane.dock.label': 'Dock',
  'workspaceMisc.floatingPane.resize.aria': 'Resize floating pane',
  'workspaceMisc.agentRun.aria': 'AI agent generation status',
  'workspaceMisc.agentRun.title': 'Agent running',
  'workspaceMisc.agentRun.description': 'Streaming response and workspace actions.',
  'workspaceMisc.agentRun.stop.title': '{label} — press Escape',
  'workspaceMisc.agentRun.stop.hint': 'Escape to stop',
  'workspaceMisc.portDropdown.select': 'Select preview port',
  'workspaceMisc.portDropdown.heading': 'Preview ports',
  'workspaceMisc.portDropdown.empty': 'No preview ports are available.',
  'workspaceMisc.portDropdown.status.ready': 'Ready',
  'workspaceMisc.portDropdown.status.starting': 'Starting…',
  'workspaceMisc.portDropdown.port.aria': 'Port {port} — {status}',
  'workspaceMisc.portDropdown.copy.title': 'Copy preview URL',
  'workspaceMisc.portDropdown.copy.aria': 'Copy URL for port {port}',
  'workspaceMisc.portDropdown.copy.success': 'URL for port {port} copied.',
  'workspaceMisc.portDropdown.copy.error': 'The URL for port {port} could not be copied.',
  'workspaceMisc.expo.title': 'Preview on your mobile device',
  'workspaceMisc.expo.description':
    'Scan this QR code with the Expo Go app on your mobile device to open your project.',
  'workspaceMisc.expo.qr.aria': 'QR code for opening the project in Expo Go',
  'workspaceMisc.expo.empty': 'No Expo URL was detected.',
  'workspaceMisc.editorHistory.open.aria': 'Open file history',
  'workspaceMisc.editorHistory.open.label': 'History',
} as const;

export type WorkspaceMiscKey = keyof typeof workspaceMiscEn;
export type WorkspaceMiscCopy = Readonly<Record<WorkspaceMiscKey, string>>;

export const workspaceMiscFr: WorkspaceMiscCopy = {
  'workspaceMisc.floatingPane.aria': 'Panneau flottant : {title}',
  'workspaceMisc.floatingPane.dock.aria': 'Ancrer le panneau',
  'workspaceMisc.floatingPane.dock.label': 'Ancrer',
  'workspaceMisc.floatingPane.resize.aria': 'Redimensionner le panneau flottant',
  'workspaceMisc.agentRun.aria': 'État de génération de l’agent IA',
  'workspaceMisc.agentRun.title': 'Agent en cours d’exécution',
  'workspaceMisc.agentRun.description': 'Réponse diffusée et actions exécutées dans l’espace de travail.',
  'workspaceMisc.agentRun.stop.title': '{label} — appuyez sur Échap',
  'workspaceMisc.agentRun.stop.hint': 'Échap pour arrêter',
  'workspaceMisc.portDropdown.select': 'Sélectionner le port d’aperçu',
  'workspaceMisc.portDropdown.heading': 'Ports d’aperçu',
  'workspaceMisc.portDropdown.empty': 'Aucun port d’aperçu n’est disponible.',
  'workspaceMisc.portDropdown.status.ready': 'Prêt',
  'workspaceMisc.portDropdown.status.starting': 'Démarrage…',
  'workspaceMisc.portDropdown.port.aria': 'Port {port} — {status}',
  'workspaceMisc.portDropdown.copy.title': 'Copier l’URL d’aperçu',
  'workspaceMisc.portDropdown.copy.aria': 'Copier l’URL du port {port}',
  'workspaceMisc.portDropdown.copy.success': 'URL du port {port} copiée.',
  'workspaceMisc.portDropdown.copy.error': 'Impossible de copier l’URL du port {port}.',
  'workspaceMisc.expo.title': 'Affichez l’aperçu sur votre appareil mobile',
  'workspaceMisc.expo.description':
    'Scannez ce code QR avec l’application Expo Go sur votre appareil mobile pour ouvrir votre projet.',
  'workspaceMisc.expo.qr.aria': 'Code QR pour ouvrir le projet dans Expo Go',
  'workspaceMisc.expo.empty': 'Aucune URL Expo n’a été détectée.',
  'workspaceMisc.editorHistory.open.aria': 'Ouvrir l’historique du fichier',
  'workspaceMisc.editorHistory.open.label': 'Historique',
};

export function getWorkspaceMiscCopy(language?: string | null): WorkspaceMiscCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? workspaceMiscFr : workspaceMiscEn;
}

export function formatWorkspaceMiscCopy(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{([^{}]+)\}/g, (match, key: string) => {
    const value = values[key];

    return value === undefined ? match : String(value);
  });
}
