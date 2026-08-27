import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const githubAuthDialogEn = {
  'githubAuthDialog.title': 'Connect to GitHub',
  'githubAuthDialog.description':
    'Use a personal access token to connect GitHub and deploy your repositories from E-Code.',
  'githubAuthDialog.close': 'Close GitHub connection dialog',
  'githubAuthDialog.tip.label': 'Tip:',
  'githubAuthDialog.tip.description': 'A GitHub token is required to deploy repositories.',
  'githubAuthDialog.scopes.label': 'Required scopes:',
  'githubAuthDialog.tokenType.label': 'Token Type',
  'githubAuthDialog.tokenType.classic': 'Personal Access Token (Classic)',
  'githubAuthDialog.tokenType.fineGrained': 'Fine-grained Token',
  'githubAuthDialog.token.classicLabel': 'Personal Access Token',
  'githubAuthDialog.token.fineGrainedLabel': 'Fine-grained Token',
  'githubAuthDialog.token.classicPlaceholder': 'Enter your GitHub personal access token',
  'githubAuthDialog.token.fineGrainedPlaceholder': 'Enter your GitHub fine-grained token',
  'githubAuthDialog.token.show': 'Show token',
  'githubAuthDialog.token.hide': 'Hide token',
  'githubAuthDialog.token.get': 'Get your token',
  'githubAuthDialog.validation.tokenRequired': 'Enter your GitHub access token to continue.',
  'githubAuthDialog.error.title': 'GitHub connection failed',
  'githubAuthDialog.error.safeMessage': 'GitHub could not be connected. Verify your token and try again.',
  'githubAuthDialog.action.cancel': 'Cancel',
  'githubAuthDialog.action.connecting': 'Connecting…',
  'githubAuthDialog.action.connect': 'Connect',
} as const;

export type GitHubAuthDialogKey = keyof typeof githubAuthDialogEn;
export type GitHubAuthDialogCopy = Readonly<Record<GitHubAuthDialogKey, string>>;

export const githubAuthDialogFr: GitHubAuthDialogCopy = {
  'githubAuthDialog.title': 'Se connecter à GitHub',
  'githubAuthDialog.description':
    'Utilisez un jeton d’accès personnel pour connecter GitHub et déployer vos dépôts depuis E-Code.',
  'githubAuthDialog.close': 'Fermer la fenêtre de connexion GitHub',
  'githubAuthDialog.tip.label': 'Conseil :',
  'githubAuthDialog.tip.description': 'Un jeton GitHub est nécessaire pour déployer des dépôts.',
  'githubAuthDialog.scopes.label': 'Autorisations requises :',
  'githubAuthDialog.tokenType.label': 'Type de jeton',
  'githubAuthDialog.tokenType.classic': 'Jeton d’accès personnel (classique)',
  'githubAuthDialog.tokenType.fineGrained': 'Jeton à granularité fine',
  'githubAuthDialog.token.classicLabel': 'Jeton d’accès personnel',
  'githubAuthDialog.token.fineGrainedLabel': 'Jeton à granularité fine',
  'githubAuthDialog.token.classicPlaceholder': 'Saisissez votre jeton d’accès personnel GitHub',
  'githubAuthDialog.token.fineGrainedPlaceholder': 'Saisissez votre jeton GitHub à granularité fine',
  'githubAuthDialog.token.show': 'Afficher le jeton',
  'githubAuthDialog.token.hide': 'Masquer le jeton',
  'githubAuthDialog.token.get': 'Obtenir votre jeton',
  'githubAuthDialog.validation.tokenRequired': 'Saisissez votre jeton d’accès GitHub pour continuer.',
  'githubAuthDialog.error.title': 'Échec de la connexion GitHub',
  'githubAuthDialog.error.safeMessage': 'Impossible de connecter GitHub. Vérifiez votre jeton, puis réessayez.',
  'githubAuthDialog.action.cancel': 'Annuler',
  'githubAuthDialog.action.connecting': 'Connexion…',
  'githubAuthDialog.action.connect': 'Se connecter',
};

export function getGitHubAuthDialogCopy(language?: string | null): GitHubAuthDialogCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? githubAuthDialogFr : githubAuthDialogEn;
}

/** Never expose arbitrary GitHub or network exceptions in the dialog. */
export function getGitHubAuthDialogSafeError(language?: string | null, _error?: unknown): string {
  return getGitHubAuthDialogCopy(language)['githubAuthDialog.error.safeMessage'];
}
