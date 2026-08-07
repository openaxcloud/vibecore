import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const gitCloneEn = {
  'gitClone.error.workspaceStart': 'Git tools could not start because the workspace is unavailable.',
  'gitClone.error.runtimeNotReady': 'The workspace is not ready yet. Wait a moment, then try again.',
  'gitClone.auth.required': 'This repository requires authentication. Would you like to enter your GitHub credentials?',
  'gitClone.auth.username': 'Enter your username',
  'gitClone.auth.password': 'Enter your password or personal access token',
  'gitClone.error.authenticationHost': 'Authentication failed for {host}. Check your credentials and try again.',
  'gitClone.error.authentication': 'Authentication failed. Check your GitHub credentials and try again.',
  'gitClone.error.network': 'The repository could not be reached. Check your internet connection and try again.',
  'gitClone.error.networkExhausted':
    'The repository could not be reached after several attempts. Check your internet connection and try again.',
  'gitClone.error.notFound': 'Repository not found. Check the URL and confirm that the repository exists.',
  'gitClone.error.unauthorized':
    'You do not have access to this repository. Connect GitHub with the required permissions.',
  'gitClone.error.generic': 'The repository could not be cloned. Check the URL and try again.',
} as const;

export type GitCloneKey = keyof typeof gitCloneEn;
export type GitCloneCopy = Readonly<Record<GitCloneKey, string>>;

export const gitCloneFr: GitCloneCopy = {
  'gitClone.error.workspaceStart': 'Impossible de démarrer les outils Git, car l’espace de travail est indisponible.',
  'gitClone.error.runtimeNotReady':
    'L’espace de travail n’est pas encore prêt. Patientez quelques instants, puis réessayez.',
  'gitClone.auth.required': 'Ce dépôt nécessite une authentification. Souhaitez-vous saisir vos identifiants GitHub ?',
  'gitClone.auth.username': 'Saisissez votre nom d’utilisateur',
  'gitClone.auth.password': 'Saisissez votre mot de passe ou votre jeton d’accès personnel',
  'gitClone.error.authenticationHost':
    'Échec de l’authentification auprès de {host}. Vérifiez vos identifiants, puis réessayez.',
  'gitClone.error.authentication': 'Échec de l’authentification. Vérifiez vos identifiants GitHub, puis réessayez.',
  'gitClone.error.network': 'Impossible de joindre le dépôt. Vérifiez votre connexion Internet, puis réessayez.',
  'gitClone.error.networkExhausted':
    'Impossible de joindre le dépôt après plusieurs tentatives. Vérifiez votre connexion Internet, puis réessayez.',
  'gitClone.error.notFound': 'Dépôt introuvable. Vérifiez l’URL et assurez-vous que le dépôt existe.',
  'gitClone.error.unauthorized': 'Vous n’avez pas accès à ce dépôt. Connectez GitHub avec les autorisations requises.',
  'gitClone.error.generic': 'Impossible de cloner le dépôt. Vérifiez l’URL, puis réessayez.',
};

export function getGitCloneCopy(language?: string | null): GitCloneCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? gitCloneFr : gitCloneEn;
}

export function formatGitCloneCopy(template: string, values: Readonly<Record<string, string | number>> = {}): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
