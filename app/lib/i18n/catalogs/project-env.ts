import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const projectEnvEn = {
  'projectEnv.meta.title': 'Environment variables — E-Code',
  'projectEnv.meta.description': 'Manage non-secret runtime configuration for each project environment.',
  'projectEnv.error.projectNotFound': 'Project not found.',
  'projectEnv.error.saveFailed': 'The variable could not be saved. Check its name and try again.',
  'projectEnv.error.deleteFailed': 'The variable could not be deleted. Refresh the page and try again.',
  'projectEnv.error.serviceUnavailable': 'Environment variables are unavailable right now. Try again shortly.',
  'projectEnv.page.title': 'Environment variables',
  'projectEnv.page.description': 'Manage non-secret runtime configuration for Development, Preview, and Production.',
  'projectEnv.scope.ariaLabel': 'Environment scope',
  'projectEnv.scope.development': 'Development',
  'projectEnv.scope.preview': 'Preview',
  'projectEnv.scope.production': 'Production',
  'projectEnv.empty.title': 'No variables in {scope}',
  'projectEnv.empty.description': 'Add the first variable for the {scope} environment.',
  'projectEnv.row.updated': 'Updated {date}',
  'projectEnv.row.dateUnavailable': 'date unavailable',
  'projectEnv.row.saved': 'Saved for this project',
  'projectEnv.delete.ariaLabel': 'Delete {key} from {scope}',
  'projectEnv.form.addingTo': 'Adding to {scope}',
  'projectEnv.form.name': 'Variable name',
  'projectEnv.form.nameHelp': 'Use uppercase letters, numbers, and underscores only.',
  'projectEnv.form.value': 'Value',
  'projectEnv.form.saving': 'Saving…',
  'projectEnv.form.submit': 'Save variable',
  'projectEnv.diff.title': 'Differences across environments',
  'projectEnv.diff.summary_one': '{count} variable differs between Development, Preview, and Production.',
  'projectEnv.diff.summary_other': '{count} variables differ between Development, Preview, and Production.',
  'projectEnv.diff.variable': 'Variable',
  'projectEnv.diff.notSet': '— not set',
  'projectEnv.diff.empty': '(empty)',
} as const;

export type ProjectEnvKey = keyof typeof projectEnvEn;
export type ProjectEnvCopy = Readonly<Record<ProjectEnvKey, string>>;

export const projectEnvFr: ProjectEnvCopy = {
  'projectEnv.meta.title': 'Variables d’environnement — E-Code',
  'projectEnv.meta.description':
    'Gérez la configuration non secrète de l’environnement d’exécution pour chaque environnement du projet.',
  'projectEnv.error.projectNotFound': 'Projet introuvable.',
  'projectEnv.error.saveFailed': 'Impossible d’enregistrer la variable. Vérifiez son nom, puis réessayez.',
  'projectEnv.error.deleteFailed': 'Impossible de supprimer la variable. Actualisez la page, puis réessayez.',
  'projectEnv.error.serviceUnavailable':
    'Les variables d’environnement sont indisponibles pour le moment. Réessayez dans quelques instants.',
  'projectEnv.page.title': 'Variables d’environnement',
  'projectEnv.page.description':
    'Gérez la configuration non secrète de l’environnement d’exécution pour les environnements Développement, Aperçu et Production.',
  'projectEnv.scope.ariaLabel': 'Environnement cible',
  'projectEnv.scope.development': 'Développement',
  'projectEnv.scope.preview': 'Aperçu',
  'projectEnv.scope.production': 'Production',
  'projectEnv.empty.title': 'Aucune variable dans {scope}',
  'projectEnv.empty.description': 'Ajoutez la première variable de l’environnement {scope}.',
  'projectEnv.row.updated': 'Mise à jour le {date}',
  'projectEnv.row.dateUnavailable': 'date indisponible',
  'projectEnv.row.saved': 'Enregistrée pour ce projet',
  'projectEnv.delete.ariaLabel': 'Supprimer {key} de l’environnement {scope}',
  'projectEnv.form.addingTo': 'Ajout dans l’environnement {scope}',
  'projectEnv.form.name': 'Nom de la variable',
  'projectEnv.form.nameHelp': 'Utilisez uniquement des lettres majuscules, des chiffres et des tirets bas.',
  'projectEnv.form.value': 'Valeur',
  'projectEnv.form.saving': 'Enregistrement…',
  'projectEnv.form.submit': 'Enregistrer la variable',
  'projectEnv.diff.title': 'Différences entre les environnements',
  'projectEnv.diff.summary_one': '{count} variable diffère entre Développement, Aperçu et Production.',
  'projectEnv.diff.summary_other': '{count} variables diffèrent entre Développement, Aperçu et Production.',
  'projectEnv.diff.variable': 'Variable',
  'projectEnv.diff.notSet': '— non définie',
  'projectEnv.diff.empty': '(vide)',
};

export type ProjectEnvLanguage = 'en' | 'fr';

export function resolveProjectEnvLanguage(language?: string | null): ProjectEnvLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

export function getProjectEnvCopy(language?: string | null): ProjectEnvCopy {
  return resolveProjectEnvLanguage(language) === 'fr' ? projectEnvFr : projectEnvEn;
}

export function formatProjectEnvCopy(template: string, values: Readonly<Record<string, string | number>> = {}): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function getProjectEnvPluralKey(
  key: 'projectEnv.diff.summary',
  count: number,
  language?: string | null,
): 'projectEnv.diff.summary_one' | 'projectEnv.diff.summary_other' {
  const locale = resolveProjectEnvLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
  return `${key}_${new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other'}`;
}

export function getProjectEnvScopeLabel(scope: 'development' | 'preview' | 'production', copy: ProjectEnvCopy): string {
  return copy[`projectEnv.scope.${scope}`];
}
