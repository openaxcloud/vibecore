import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

/*
 * Fin de tour de l'agent — parité Replit (RP-CKPT-01 à 07) : sous chaque
 * réponse de l'agent, « Worked for 2 minutes » et « Checkpoint made 25 days
 * ago », repliables, puis la feuille « Rollback to this checkpoint? ».
 */
export const finDeTourEn = {
  'finDeTour.worked': 'Worked for {{duration}}',
  'finDeTour.workedUnknown': 'Worked on this turn',
  'finDeTour.timeWorked': 'Time worked',
  'finDeTour.workDone': 'Work done',
  'finDeTour.itemsRead': 'Items read',
  'finDeTour.agentUsage': 'Agent usage',
  'finDeTour.action': '{{count}} action',
  'finDeTour.actions': '{{count}} actions',
  'finDeTour.line': '{{count}} line',
  'finDeTour.lines': '{{count}} lines',
  'finDeTour.tokens': '{{count}} tokens',
  'finDeTour.unknown': '—',
  'finDeTour.checkpoint': 'Checkpoint made {{ago}}',
  'finDeTour.rollback': 'Rollback here',
  'finDeTour.changes': 'Changes',
  'finDeTour.expand': 'Show details',
  'finDeTour.collapse': 'Hide details',
  'finDeTour.dateAt': '{{date}} at {{time}}',
  'finDeTour.ago.now': 'just now',
  'finDeTour.ago.minute': '1 minute ago',
  'finDeTour.ago.minutes': '{{count}} minutes ago',
  'finDeTour.ago.hour': '1 hour ago',
  'finDeTour.ago.hours': '{{count}} hours ago',
  'finDeTour.ago.day': '1 day ago',
  'finDeTour.ago.days': '{{count}} days ago',
  'finDeTour.ago.month': '1 month ago',
  'finDeTour.ago.months': '{{count}} months ago',
  'finDeTour.ago.year': '1 year ago',
  'finDeTour.ago.years': '{{count}} years ago',
  'finDeTour.duration.instant': 'less than a second',
  'finDeTour.duration.second': '1 second',
  'finDeTour.duration.seconds': '{{count}} seconds',
  'finDeTour.duration.minute': '1 minute',
  'finDeTour.duration.minutes': '{{count}} minutes',
  'finDeTour.duration.hour': '1 hour',
  'finDeTour.duration.hours': '{{count}} hours',
  'finDeTour.rollbackDialog.title': 'Rollback to this checkpoint?',
  'finDeTour.rollbackDialog.impact': 'What will be impacted',
  'finDeTour.rollbackDialog.files': 'Files',
  'finDeTour.rollbackDialog.filesDetail':
    'All files in your app will be restored to the state they were in at the time of this checkpoint.',
  'finDeTour.rollbackDialog.database': 'Database',
  'finDeTour.rollbackDialog.databaseDetail':
    'Your development database will be restored to the time of this checkpoint.',
  'finDeTour.rollbackDialog.memory': 'Agent memory',
  'finDeTour.rollbackDialog.memoryDetail':
    "The Agent's memory will reset to what it knew about your app at the time of this checkpoint.",
  'finDeTour.rollbackDialog.cancel': 'Cancel',
  'finDeTour.rollbackDialog.confirm': 'Rollback to this checkpoint',
  'finDeTour.rollbackDialog.busy': 'Rolling back…',
  'finDeTour.rollbackDialog.close': 'Close',
} as const;

export type FinDeTourKey = keyof typeof finDeTourEn;
export type FinDeTourCopy = Readonly<Record<FinDeTourKey, string>>;

export const finDeTourFr: FinDeTourCopy = {
  'finDeTour.worked': 'A travaillé {{duration}}',
  'finDeTour.workedUnknown': 'A travaillé sur ce tour',
  'finDeTour.timeWorked': 'Temps de travail',
  'finDeTour.workDone': 'Travail effectué',
  'finDeTour.itemsRead': 'Éléments lus',
  'finDeTour.agentUsage': 'Utilisation de l’agent',
  'finDeTour.action': '{{count}} action',
  'finDeTour.actions': '{{count}} actions',
  'finDeTour.line': '{{count}} ligne',
  'finDeTour.lines': '{{count}} lignes',
  'finDeTour.tokens': '{{count}} jetons',
  'finDeTour.unknown': '—',
  'finDeTour.checkpoint': 'Point de restauration créé {{ago}}',
  'finDeTour.rollback': 'Revenir ici',
  'finDeTour.changes': 'Modifications',
  'finDeTour.expand': 'Afficher le détail',
  'finDeTour.collapse': 'Masquer le détail',
  'finDeTour.dateAt': '{{date}} à {{time}}',
  'finDeTour.ago.now': 'à l’instant',
  'finDeTour.ago.minute': 'il y a 1 minute',
  'finDeTour.ago.minutes': 'il y a {{count}} minutes',
  'finDeTour.ago.hour': 'il y a 1 heure',
  'finDeTour.ago.hours': 'il y a {{count}} heures',
  'finDeTour.ago.day': 'il y a 1 jour',
  'finDeTour.ago.days': 'il y a {{count}} jours',
  'finDeTour.ago.month': 'il y a 1 mois',
  'finDeTour.ago.months': 'il y a {{count}} mois',
  'finDeTour.ago.year': 'il y a 1 an',
  'finDeTour.ago.years': 'il y a {{count}} ans',
  'finDeTour.duration.instant': 'moins d’une seconde',
  'finDeTour.duration.second': '1 seconde',
  'finDeTour.duration.seconds': '{{count}} secondes',
  'finDeTour.duration.minute': '1 minute',
  'finDeTour.duration.minutes': '{{count}} minutes',
  'finDeTour.duration.hour': '1 heure',
  'finDeTour.duration.hours': '{{count}} heures',
  'finDeTour.rollbackDialog.title': 'Revenir à ce point de restauration ?',
  'finDeTour.rollbackDialog.impact': 'Ce qui sera affecté',
  'finDeTour.rollbackDialog.files': 'Fichiers',
  'finDeTour.rollbackDialog.filesDetail':
    'Tous les fichiers de votre application seront remis dans l’état où ils étaient au moment de ce point de restauration.',
  'finDeTour.rollbackDialog.database': 'Base de données',
  'finDeTour.rollbackDialog.databaseDetail':
    'Votre base de données de développement sera remise à la date de ce point de restauration.',
  'finDeTour.rollbackDialog.memory': 'Mémoire de l’agent',
  'finDeTour.rollbackDialog.memoryDetail':
    'La mémoire de l’agent sera remise à ce qu’il savait de votre application au moment de ce point de restauration.',
  'finDeTour.rollbackDialog.cancel': 'Annuler',
  'finDeTour.rollbackDialog.confirm': 'Revenir à ce point de restauration',
  'finDeTour.rollbackDialog.busy': 'Retour en cours…',
  'finDeTour.rollbackDialog.close': 'Fermer',
};

export function resolveFinDeTourLanguage(language?: string | null): MarketingLanguage {
  return resolveMarketingLanguage(language);
}

export function getFinDeTourCopy(language?: string | null): FinDeTourCopy {
  return resolveFinDeTourLanguage(language) === 'fr' ? finDeTourFr : finDeTourEn;
}

export function formatFinDeTourCopy(template: string, values: Readonly<Record<string, string | number>> = {}): string {
  return template.replace(/\{\{(\w+)\}\}/gu, (_match, name: string) => String(values[name] ?? ''));
}
