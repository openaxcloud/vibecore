import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const projectSecretsEn = {
  'projectSecrets.meta.title': 'Project secrets — E-Code',
  'projectSecrets.meta.description': 'Manage encrypted secrets injected securely into your project runtime.',
  'projectSecrets.error.projectNotFound': 'Project not found.',
  'projectSecrets.error.serviceUnavailable': 'Project secrets are unavailable right now. Try again shortly.',
  'projectSecrets.error.saveFailed': 'The secret could not be saved. Check its name and try again.',
  'projectSecrets.error.deleteFailed': 'The secret could not be deleted. Refresh the page and try again.',
  'projectSecrets.page.title': 'Secrets',
  'projectSecrets.page.description':
    'Encrypted project secrets with explicit runtime injection and no plain-text logs.',
  'projectSecrets.copy.success': 'Secret name copied',
  'projectSecrets.copy.failed': 'Could not copy the secret name.',
  'projectSecrets.copy.ariaLabel': 'Copy secret name {key}',
  'projectSecrets.delete.ariaLabel': 'Delete secret {key}',
  'projectSecrets.row.updated': 'Encrypted · updated {date}',
  'projectSecrets.row.dateUnavailable': 'date unavailable',
  'projectSecrets.row.saved': 'Encrypted project secret',
  'projectSecrets.empty.title': 'No project secrets',
  'projectSecrets.empty.description': 'Secrets are encrypted and their values are never listed in plain text.',
  'projectSecrets.form.name': 'Secret name',
  'projectSecrets.form.nameHelp': 'Use uppercase letters, numbers, and underscores only.',
  'projectSecrets.form.value': 'Secret value',
  'projectSecrets.form.revealSubject': 'the secret value',
  'projectSecrets.form.saving': 'Saving…',
  'projectSecrets.form.submit': 'Save secret',
} as const;

export type ProjectSecretsKey = keyof typeof projectSecretsEn;
export type ProjectSecretsCopy = Readonly<Record<ProjectSecretsKey, string>>;

export const projectSecretsFr: ProjectSecretsCopy = {
  'projectSecrets.meta.title': 'Secrets du projet — E-Code',
  'projectSecrets.meta.description':
    'Gérez les secrets chiffrés injectés de manière sécurisée dans l’environnement d’exécution de votre projet.',
  'projectSecrets.error.projectNotFound': 'Projet introuvable.',
  'projectSecrets.error.serviceUnavailable':
    'Les secrets du projet sont indisponibles pour le moment. Réessayez dans quelques instants.',
  'projectSecrets.error.saveFailed': 'Impossible d’enregistrer le secret. Vérifiez son nom, puis réessayez.',
  'projectSecrets.error.deleteFailed': 'Impossible de supprimer le secret. Actualisez la page, puis réessayez.',
  'projectSecrets.page.title': 'Secrets',
  'projectSecrets.page.description':
    'Gérez les secrets chiffrés du projet, leur injection explicite dans l’environnement d’exécution et leur exclusion des journaux en clair.',
  'projectSecrets.copy.success': 'Nom du secret copié',
  'projectSecrets.copy.failed': 'Impossible de copier le nom du secret.',
  'projectSecrets.copy.ariaLabel': 'Copier le nom du secret {key}',
  'projectSecrets.delete.ariaLabel': 'Supprimer le secret {key}',
  'projectSecrets.row.updated': 'Chiffré · mis à jour le {date}',
  'projectSecrets.row.dateUnavailable': 'date indisponible',
  'projectSecrets.row.saved': 'Secret du projet chiffré',
  'projectSecrets.empty.title': 'Aucun secret de projet',
  'projectSecrets.empty.description': 'Les secrets sont chiffrés et leurs valeurs ne sont jamais affichées en clair.',
  'projectSecrets.form.name': 'Nom du secret',
  'projectSecrets.form.nameHelp': 'Utilisez uniquement des lettres majuscules, des chiffres et des tirets bas.',
  'projectSecrets.form.value': 'Valeur du secret',
  'projectSecrets.form.revealSubject': 'la valeur du secret',
  'projectSecrets.form.saving': 'Enregistrement…',
  'projectSecrets.form.submit': 'Enregistrer le secret',
};

export type ProjectSecretsLanguage = 'en' | 'fr';

export function resolveProjectSecretsLanguage(language?: string | null): ProjectSecretsLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

export function getProjectSecretsCopy(language?: string | null): ProjectSecretsCopy {
  return resolveProjectSecretsLanguage(language) === 'fr' ? projectSecretsFr : projectSecretsEn;
}

export function formatProjectSecretsCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
