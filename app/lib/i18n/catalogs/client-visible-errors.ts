import { detectUserLanguage, normalizeSupportedLanguage } from '~/lib/i18n/language';

export const clientVisibleErrorsEn = {
  'clientErrors.terminal.managedShellSpawnFailed': 'Could not start the managed shell.',
  'clientErrors.terminal.shellSpawnFailed': 'Could not start the shell.',
  'clientErrors.rollback.snapshotMissing': 'Rollback failed: the checkpoint snapshot is no longer available.',
  'clientErrors.rollback.snapshotCorrupted': 'Rollback failed: the checkpoint snapshot is corrupted.',
  'clientErrors.rollback.forbidden': "Rollback failed: you don't have permission to restore this checkpoint.",
  'clientErrors.rollback.server':
    'Rollback failed: the server could not restore this checkpoint. No changes were made.',
  'clientErrors.rollback.generic': 'Rollback failed. No changes were made.',
  'clientErrors.autoApply.fileFallback': 'the file',
  'clientErrors.autoApply.review': "Couldn't apply {file} — review the change.",
  'clientErrors.autoApply.permission': "Couldn't apply {file} — write access was denied.",
  'clientErrors.autoApply.missing': "Couldn't apply {file} — the file no longer exists.",
  'clientErrors.autoApply.locked': "Couldn't apply {file} — the file is locked or in use.",
  'clientErrors.autoApply.conflict': "Couldn't apply {file} — the file changed before the update was saved.",
  'clientErrors.bedrock.invalidFormat':
    'Invalid AWS Bedrock configuration. Enter valid JSON containing region, accessKeyId, and secretAccessKey.',
  'clientErrors.bedrock.missingCredentials':
    'AWS credentials are incomplete. Include region, accessKeyId, and secretAccessKey.',
  'clientErrors.localModels.unknown': 'The local model health check failed.',
  'clientErrors.localModels.cors':
    'CORS_ERROR: {provider} is blocking requests from this origin. Enable CORS in {provider} settings or use the E-Code desktop app.',
  'clientErrors.localModels.http': 'The {provider} endpoint returned HTTP {status}.',
  'clientErrors.localModels.timeout': 'The {provider} health check timed out.',
  'clientErrors.localModels.requestFailed': 'The {provider} health check failed. Verify the endpoint and try again.',
  'clientErrors.localModels.unsupportedProvider': 'The local model provider {provider} is not supported.',
} as const;

export type ClientVisibleErrorsKey = keyof typeof clientVisibleErrorsEn;
export type ClientVisibleErrorsCopy = Readonly<Record<ClientVisibleErrorsKey, string>>;
export type ClientVisibleErrorsLanguage = 'en' | 'fr';

export const clientVisibleErrorsFr: ClientVisibleErrorsCopy = {
  'clientErrors.terminal.managedShellSpawnFailed': 'Impossible de démarrer le shell géré.',
  'clientErrors.terminal.shellSpawnFailed': 'Impossible de démarrer le shell.',
  'clientErrors.rollback.snapshotMissing':
    'Restauration impossible : l’instantané du point de contrôle n’est plus disponible.',
  'clientErrors.rollback.snapshotCorrupted':
    'Restauration impossible : l’instantané du point de contrôle est corrompu.',
  'clientErrors.rollback.forbidden':
    'Restauration impossible : vous n’êtes pas autorisé à restaurer ce point de contrôle.',
  'clientErrors.rollback.server':
    'Restauration impossible : le serveur n’a pas pu restaurer ce point de contrôle. Aucune modification n’a été apportée.',
  'clientErrors.rollback.generic': 'Restauration impossible. Aucune modification n’a été apportée.',
  'clientErrors.autoApply.fileFallback': 'ce fichier',
  'clientErrors.autoApply.review': 'Impossible d’appliquer les modifications à {file} — vérifiez-les.',
  'clientErrors.autoApply.permission':
    'Impossible d’appliquer les modifications à {file} — l’accès en écriture a été refusé.',
  'clientErrors.autoApply.missing': 'Impossible d’appliquer les modifications à {file} — le fichier n’existe plus.',
  'clientErrors.autoApply.locked':
    'Impossible d’appliquer les modifications à {file} — le fichier est verrouillé ou utilisé.',
  'clientErrors.autoApply.conflict':
    'Impossible d’appliquer les modifications à {file} — le fichier a changé avant l’enregistrement de la mise à jour.',
  'clientErrors.bedrock.invalidFormat':
    'La configuration AWS Bedrock n’est pas valide. Saisissez un JSON valide contenant region, accessKeyId et secretAccessKey.',
  'clientErrors.bedrock.missingCredentials':
    'Les identifiants AWS sont incomplets. Ajoutez region, accessKeyId et secretAccessKey.',
  'clientErrors.localModels.unknown': 'La vérification de l’état du modèle local a échoué.',
  'clientErrors.localModels.cors':
    'CORS_ERROR : {provider} bloque les requêtes provenant de cette origine. Activez CORS dans les paramètres de {provider} ou utilisez l’application de bureau E-Code.',
  'clientErrors.localModels.http': 'Le point de terminaison {provider} a renvoyé le code HTTP {status}.',
  'clientErrors.localModels.timeout': 'La vérification de l’état de {provider} a expiré.',
  'clientErrors.localModels.requestFailed':
    'La vérification de l’état de {provider} a échoué. Vérifiez le point de terminaison, puis réessayez.',
  'clientErrors.localModels.unsupportedProvider':
    'Le fournisseur de modèles locaux {provider} n’est pas pris en charge.',
};

export function resolveClientVisibleErrorsLanguage(language?: string | null): ClientVisibleErrorsLanguage {
  const normalized = normalizeSupportedLanguage(language ?? detectUserLanguage());

  return normalized === 'fr' ? 'fr' : 'en';
}

export function getClientVisibleErrorsCopy(language?: string | null): ClientVisibleErrorsCopy {
  return resolveClientVisibleErrorsLanguage(language) === 'fr' ? clientVisibleErrorsFr : clientVisibleErrorsEn;
}

export function formatClientVisibleErrorCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export type TerminalSpawnTarget = 'managed' | 'shell';

export function formatTerminalSpawnFailure(target: TerminalSpawnTarget, language?: string | null): string {
  const copy = getClientVisibleErrorsCopy(language);

  return copy[
    target === 'managed' ? 'clientErrors.terminal.managedShellSpawnFailed' : 'clientErrors.terminal.shellSpawnFailed'
  ];
}

export type SnapshotRestoreFailure = 'snapshotMissing' | 'snapshotCorrupted' | 'forbidden' | 'server' | 'generic';

export function formatSnapshotRestoreFailure(failure: SnapshotRestoreFailure, language?: string | null): string {
  return getClientVisibleErrorsCopy(language)[`clientErrors.rollback.${failure}`];
}

export type AutoApplyFailureReason = 'review' | 'permission' | 'missing' | 'locked' | 'conflict';

export function formatAutoApplyFailure(
  filePath: string,
  reason: AutoApplyFailureReason,
  language?: string | null,
): string {
  const copy = getClientVisibleErrorsCopy(language);
  const file = filePath.trim().length > 0 ? filePath : copy['clientErrors.autoApply.fileFallback'];

  return formatClientVisibleErrorCopy(copy[`clientErrors.autoApply.${reason}`], { file });
}

export type BedrockConfigFailure = 'invalidFormat' | 'missingCredentials';

export function formatBedrockConfigFailure(failure: BedrockConfigFailure, language?: string | null): string {
  return getClientVisibleErrorsCopy(language)[`clientErrors.bedrock.${failure}`];
}

export type LocalModelHealthFailure =
  | { kind: 'unknown' }
  | { kind: 'cors'; provider: string }
  | { kind: 'http'; provider: string; status: number }
  | { kind: 'timeout'; provider: string }
  | { kind: 'requestFailed'; provider: string }
  | { kind: 'unsupportedProvider'; provider: string };

export function formatLocalModelHealthFailure(failure: LocalModelHealthFailure, language?: string | null): string {
  const copy = getClientVisibleErrorsCopy(language);
  const template = copy[`clientErrors.localModels.${failure.kind}`];

  return formatClientVisibleErrorCopy(template, {
    ...('provider' in failure ? { provider: failure.provider } : {}),
    ...('status' in failure ? { status: failure.status } : {}),
  });
}
