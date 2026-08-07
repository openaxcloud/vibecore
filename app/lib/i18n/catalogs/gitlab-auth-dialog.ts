import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const gitLabAuthDialogEn = {
  'gitLabAuthDialog.title': 'Connect to GitLab',
  'gitLabAuthDialog.description': 'Connect your GitLab account to deploy your projects from E-Code.',
  'gitLabAuthDialog.close': 'Close GitLab connection dialog',
  'gitLabAuthDialog.url.label': 'GitLab URL',
  'gitLabAuthDialog.url.placeholder': 'https://gitlab.com',
  'gitLabAuthDialog.url.help': 'Use GitLab.com or the address of your self-hosted GitLab instance.',
  'gitLabAuthDialog.token.label': 'Access Token',
  'gitLabAuthDialog.token.placeholder': 'Enter your GitLab access token',
  'gitLabAuthDialog.token.show': 'Show token',
  'gitLabAuthDialog.token.hide': 'Hide token',
  'gitLabAuthDialog.token.get': 'Get your token',
  'gitLabAuthDialog.scopes.label': 'Required scopes:',
  'gitLabAuthDialog.validation.urlRequired': 'Enter your GitLab URL to continue.',
  'gitLabAuthDialog.validation.urlInvalid': 'Enter a valid HTTP or HTTPS GitLab URL.',
  'gitLabAuthDialog.validation.tokenRequired': 'Enter your GitLab access token to continue.',
  'gitLabAuthDialog.error.title': 'GitLab connection failed',
  'gitLabAuthDialog.error.safeMessage': 'GitLab could not be connected. Verify the URL and token, then try again.',
  'gitLabAuthDialog.action.cancel': 'Cancel',
  'gitLabAuthDialog.action.connecting': 'Connecting…',
  'gitLabAuthDialog.action.connect': 'Connect to GitLab',
} as const;

export type GitLabAuthDialogKey = keyof typeof gitLabAuthDialogEn;
export type GitLabAuthDialogCopy = Readonly<Record<GitLabAuthDialogKey, string>>;

export const gitLabAuthDialogFr: GitLabAuthDialogCopy = {
  'gitLabAuthDialog.title': 'Se connecter à GitLab',
  'gitLabAuthDialog.description': 'Connectez votre compte GitLab pour déployer vos projets depuis E-Code.',
  'gitLabAuthDialog.close': 'Fermer la fenêtre de connexion GitLab',
  'gitLabAuthDialog.url.label': 'URL GitLab',
  'gitLabAuthDialog.url.placeholder': 'https://gitlab.com',
  'gitLabAuthDialog.url.help': 'Utilisez GitLab.com ou l’adresse de votre instance GitLab auto-hébergée.',
  'gitLabAuthDialog.token.label': 'Jeton d’accès',
  'gitLabAuthDialog.token.placeholder': 'Saisissez votre jeton d’accès GitLab',
  'gitLabAuthDialog.token.show': 'Afficher le jeton',
  'gitLabAuthDialog.token.hide': 'Masquer le jeton',
  'gitLabAuthDialog.token.get': 'Obtenir votre jeton',
  'gitLabAuthDialog.scopes.label': 'Autorisations requises :',
  'gitLabAuthDialog.validation.urlRequired': 'Saisissez votre URL GitLab pour continuer.',
  'gitLabAuthDialog.validation.urlInvalid': 'Saisissez une URL GitLab HTTP ou HTTPS valide.',
  'gitLabAuthDialog.validation.tokenRequired': 'Saisissez votre jeton d’accès GitLab pour continuer.',
  'gitLabAuthDialog.error.title': 'Échec de la connexion GitLab',
  'gitLabAuthDialog.error.safeMessage': 'Impossible de connecter GitLab. Vérifiez l’URL et le jeton, puis réessayez.',
  'gitLabAuthDialog.action.cancel': 'Annuler',
  'gitLabAuthDialog.action.connecting': 'Connexion…',
  'gitLabAuthDialog.action.connect': 'Se connecter à GitLab',
};

export function getGitLabAuthDialogCopy(language?: string | null): GitLabAuthDialogCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? gitLabAuthDialogFr : gitLabAuthDialogEn;
}

/** Never expose arbitrary GitLab or network exceptions in the dialog. */
export function getGitLabAuthDialogSafeError(language?: string | null, _error?: unknown): string {
  return getGitLabAuthDialogCopy(language)['gitLabAuthDialog.error.safeMessage'];
}
