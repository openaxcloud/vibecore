import { resolveMarketingLanguage } from './marketing';

export const supabaseConnectionEn = {
  'supabaseConnection.trigger.openAria': 'Open Supabase connection',
  'supabaseConnection.trigger.tooltip': 'Supabase connection',
  'supabaseConnection.trigger.open': 'Open Supabase',
  'supabaseConnection.trigger.connected': 'Supabase · {{projectName}}',
  'supabaseConnection.dialog.connectTitle': 'Connect to Supabase',
  'supabaseConnection.dialog.connectedTitle': 'Supabase connection',
  'supabaseConnection.token.label': 'Access token',
  'supabaseConnection.token.aria': 'Supabase access token',
  'supabaseConnection.token.placeholder': 'Enter your Supabase access token',
  'supabaseConnection.token.get': 'Get your token',
  'supabaseConnection.account.role': 'Role: {{role}}',
  'supabaseConnection.projects.loading': 'Fetching projects…',
  'supabaseConnection.projects.heading': 'Your projects ({{count}})',
  'supabaseConnection.projects.expand': 'Show your projects',
  'supabaseConnection.projects.collapse': 'Hide your projects',
  'supabaseConnection.projects.refreshFailed': 'Could not refresh projects.',
  'supabaseConnection.projects.refreshTitle': 'Refresh projects list',
  'supabaseConnection.projects.selectPrompt': 'Select a project or create a new one for this chat.',
  'supabaseConnection.projects.empty': 'No projects found',
  'supabaseConnection.project.selectAria': 'Select project {{projectName}}',
  'supabaseConnection.project.selectedAria': 'Selected project {{projectName}}',
  'supabaseConnection.toast.connected': 'Successfully connected to Supabase.',
  'supabaseConnection.toast.connectFailed': 'Could not connect to Supabase. Check your access token and try again.',
  'supabaseConnection.toast.disconnected': 'Disconnected from Supabase.',
  'supabaseConnection.toast.projectSelected': 'Project selected.',
  'supabaseConnection.toast.projectKeysFailed':
    'The project was selected, but its API keys could not be retrieved. Try again.',
  'supabaseConnection.error.noToken': 'A Supabase access token is required.',
  'supabaseConnection.action.cancel': 'Cancel',
  'supabaseConnection.action.connecting': 'Connecting…',
  'supabaseConnection.action.connect': 'Connect',
  'supabaseConnection.action.refresh': 'Refresh',
  'supabaseConnection.action.newProject': 'New project',
  'supabaseConnection.action.selected': 'Selected',
  'supabaseConnection.action.select': 'Select',
  'supabaseConnection.action.close': 'Close',
  'supabaseConnection.action.disconnect': 'Disconnect',
} as const;

export type SupabaseConnectionKey = keyof typeof supabaseConnectionEn;
export type SupabaseConnectionCopy = Readonly<Record<SupabaseConnectionKey, string>>;

export const supabaseConnectionFr: SupabaseConnectionCopy = {
  'supabaseConnection.trigger.openAria': 'Ouvrir la connexion Supabase',
  'supabaseConnection.trigger.tooltip': 'Connexion Supabase',
  'supabaseConnection.trigger.open': 'Ouvrir Supabase',
  'supabaseConnection.trigger.connected': 'Supabase · {{projectName}}',
  'supabaseConnection.dialog.connectTitle': 'Se connecter à Supabase',
  'supabaseConnection.dialog.connectedTitle': 'Connexion Supabase',
  'supabaseConnection.token.label': 'Jeton d’accès',
  'supabaseConnection.token.aria': 'Jeton d’accès Supabase',
  'supabaseConnection.token.placeholder': 'Saisissez votre jeton d’accès Supabase',
  'supabaseConnection.token.get': 'Obtenir votre jeton',
  'supabaseConnection.account.role': 'Rôle : {{role}}',
  'supabaseConnection.projects.loading': 'Chargement des projets…',
  'supabaseConnection.projects.heading': 'Vos projets ({{count}})',
  'supabaseConnection.projects.expand': 'Afficher vos projets',
  'supabaseConnection.projects.collapse': 'Masquer vos projets',
  'supabaseConnection.projects.refreshFailed': 'Impossible d’actualiser les projets.',
  'supabaseConnection.projects.refreshTitle': 'Actualiser la liste des projets',
  'supabaseConnection.projects.selectPrompt': 'Sélectionnez un projet ou créez-en un pour cette conversation.',
  'supabaseConnection.projects.empty': 'Aucun projet trouvé',
  'supabaseConnection.project.selectAria': 'Sélectionner le projet {{projectName}}',
  'supabaseConnection.project.selectedAria': 'Projet {{projectName}} sélectionné',
  'supabaseConnection.toast.connected': 'Connexion à Supabase réussie.',
  'supabaseConnection.toast.connectFailed':
    'Impossible de se connecter à Supabase. Vérifiez votre jeton d’accès, puis réessayez.',
  'supabaseConnection.toast.disconnected': 'Déconnexion de Supabase réussie.',
  'supabaseConnection.toast.projectSelected': 'Projet sélectionné.',
  'supabaseConnection.toast.projectKeysFailed':
    'Le projet est sélectionné, mais ses clés API n’ont pas pu être récupérées. Réessayez.',
  'supabaseConnection.error.noToken': 'Un jeton d’accès Supabase est requis.',
  'supabaseConnection.action.cancel': 'Annuler',
  'supabaseConnection.action.connecting': 'Connexion…',
  'supabaseConnection.action.connect': 'Se connecter',
  'supabaseConnection.action.refresh': 'Actualiser',
  'supabaseConnection.action.newProject': 'Nouveau projet',
  'supabaseConnection.action.selected': 'Sélectionné',
  'supabaseConnection.action.select': 'Sélectionner',
  'supabaseConnection.action.close': 'Fermer',
  'supabaseConnection.action.disconnect': 'Se déconnecter',
};

export function getSupabaseConnectionCopy(language?: string | null): SupabaseConnectionCopy {
  return resolveMarketingLanguage(language) === 'fr' ? supabaseConnectionFr : supabaseConnectionEn;
}

export function formatSupabaseConnectionCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatSupabaseConnectionNumber(value: number, language?: string | null): string {
  return new Intl.NumberFormat(resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US').format(value);
}

/**
 * Never surface an arbitrary API or provider exception to users. Besides being
 * untranslated, raw messages can contain request details or credential hints.
 */
export function getSupabaseConnectionSafeError(language?: string | null, _error?: unknown): string {
  return getSupabaseConnectionCopy(language)['supabaseConnection.projects.refreshFailed'];
}
