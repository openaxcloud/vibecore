export const WORKSPACE_AGENT_LOCALES = ['en', 'fr'] as const;

export type WorkspaceAgentLocale = (typeof WORKSPACE_AGENT_LOCALES)[number];

const copy = {
  en: {
    pathControlCharacters: 'The path contains control characters.',
    workspaceIdentityNotConfigured: 'The workspace identity is not configured.',
    unauthorized: 'Unauthorized workspace agent request.',
    pathEscapesRoot: 'The path is outside the workspace.',
    fileTooLargeToRead: 'The file is too large to read.',
    pathIsDirectory: 'The path points to a directory.',
    pathNotRegularFile: 'The path does not point to a regular file.',
    unsupportedWebSocket: 'This WebSocket implementation is not supported.',
    fileNotFound: 'File not found.',
    fileAlreadyExists: 'A file with this name already exists.',
    pathNotDirectory: 'The path does not point to a directory.',
    workspaceDiskFull: 'The workspace disk is full. Free some space and try again.',
    pathSymbolicLink: 'The path points to a symbolic link.',
    fileTooLarge: 'The file is too large.',
    processLimitReached: 'The workspace process limit has been reached.',
    tooManyTerminalSessions: 'Too many terminal sessions are open.',
    commandBlocked: 'This command was blocked by the abuse-prevention policy.',
    commandTimedOut: 'The command exceeded the allowed time of {milliseconds} ms.',
    commandStartFailed: 'The command could not be started.',
    commandStreamFailed: 'The command stream failed.',
    terminalSessionFailed: 'The terminal session could not be started.',
    terminalOperationFailed: 'The terminal operation failed.',
    terminalErrorPrefix: 'terminal error',
    previewUnavailable:
      'The development server on port {port} is not reachable yet. It may still be starting, or it may have stopped. Check the development server logs.',
    invalidPort: 'The preview port is invalid.',
    validationFailed: 'The request is invalid.',
    requestFailed: 'The workspace request could not be completed.',
    internalServerError: 'An internal workspace error occurred. Please try again.',
  },
  fr: {
    pathControlCharacters: 'Le chemin contient des caractères de contrôle.',
    workspaceIdentityNotConfigured: 'L’identité de l’espace de travail n’est pas configurée.',
    unauthorized: 'Requête non autorisée vers l’agent de l’espace de travail.',
    pathEscapesRoot: 'Le chemin se trouve en dehors de l’espace de travail.',
    fileTooLargeToRead: 'Le fichier est trop volumineux pour être lu.',
    pathIsDirectory: 'Le chemin pointe vers un dossier.',
    pathNotRegularFile: 'Le chemin ne pointe pas vers un fichier standard.',
    unsupportedWebSocket: 'Cette implémentation WebSocket n’est pas prise en charge.',
    fileNotFound: 'Fichier introuvable.',
    fileAlreadyExists: 'Un fichier portant ce nom existe déjà.',
    pathNotDirectory: 'Le chemin ne pointe pas vers un dossier.',
    workspaceDiskFull: 'Le disque de l’espace de travail est plein. Libérez de l’espace, puis réessayez.',
    pathSymbolicLink: 'Le chemin pointe vers un lien symbolique.',
    fileTooLarge: 'Le fichier est trop volumineux.',
    processLimitReached: 'La limite de processus de l’espace de travail a été atteinte.',
    tooManyTerminalSessions: 'Trop de sessions de terminal sont ouvertes.',
    commandBlocked: 'Cette commande a été bloquée par la politique de prévention des abus.',
    commandTimedOut: 'La commande a dépassé la durée autorisée de {milliseconds} ms.',
    commandStartFailed: 'La commande n’a pas pu démarrer.',
    commandStreamFailed: 'Le flux de la commande a échoué.',
    terminalSessionFailed: 'La session de terminal n’a pas pu démarrer.',
    terminalOperationFailed: 'L’opération du terminal a échoué.',
    terminalErrorPrefix: 'erreur du terminal',
    previewUnavailable:
      'Le serveur de développement sur le port {port} n’est pas encore joignable. Il est peut-être toujours en cours de démarrage ou s’est arrêté. Consultez les journaux du serveur de développement.',
    invalidPort: 'Le port d’aperçu est invalide.',
    validationFailed: 'La requête est invalide.',
    requestFailed: 'La requête vers l’espace de travail n’a pas pu aboutir.',
    internalServerError: 'Une erreur interne de l’espace de travail est survenue. Veuillez réessayer.',
  },
} as const;

export type WorkspaceAgentMessageKey = keyof (typeof copy)['en'];
type MessageValues = Readonly<Record<string, string | number | null | undefined>>;

export function workspaceAgentLocaleFromHeader(
  value: string | readonly string[] | null | undefined,
): WorkspaceAgentLocale {
  const header = typeof value === 'string' ? value : value ? [...value].join(',') : '';
  const match = header
    .split(',')
    .map((entry, index) => {
      const [tag, ...parameters] = entry.trim().split(';');
      const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
      const locale = primary === 'fr' ? 'fr' : primary === 'en' ? 'en' : undefined;
      const qualityValue = parameters.find((parameter) => parameter.trim().toLowerCase().startsWith('q='));
      const quality = qualityValue ? Number.parseFloat(qualityValue.trim().slice(2)) : 1;

      return { locale, quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter(
      (entry): entry is { locale: WorkspaceAgentLocale; quality: number; index: number } =>
        Boolean(entry.locale) && entry.quality > 0,
    )
    .sort((left, right) => right.quality - left.quality || left.index - right.index)[0];

  return match?.locale ?? 'en';
}

export function workspaceAgentMessage(
  key: WorkspaceAgentMessageKey,
  locale: WorkspaceAgentLocale = 'en',
  values: MessageValues = {},
): string {
  const template = copy[locale]?.[key] ?? copy.en[key];

  return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name] ?? '') : placeholder,
  );
}

const englishIndex = new Map<string, WorkspaceAgentMessageKey>(
  (Object.keys(copy.en) as WorkspaceAgentMessageKey[]).map((key) => [copy.en[key], key]),
);

export function workspaceAgentMessageKeyForEnglish(value: unknown): WorkspaceAgentMessageKey | undefined {
  return typeof value === 'string' ? englishIndex.get(value) : undefined;
}

export type WorkspaceAgentPublicError = Error & {
  code?: string;
  publicMessageKey?: WorkspaceAgentMessageKey;
  publicMessageValues?: MessageValues;
  statusCode?: number;
};

export function workspaceAgentError(
  key: WorkspaceAgentMessageKey,
  options: { code?: string; statusCode?: number; values?: MessageValues } = {},
): WorkspaceAgentPublicError {
  return Object.assign(new Error(workspaceAgentMessage(key, 'en', options.values)), {
    code: options.code,
    publicMessageKey: key,
    publicMessageValues: options.values,
    statusCode: options.statusCode,
  });
}

export function localizedWorkspaceAgentError(
  error: unknown,
  locale: WorkspaceAgentLocale,
  fallbackKey: WorkspaceAgentMessageKey,
): string {
  const typed = error as WorkspaceAgentPublicError | undefined;
  const exactKey = workspaceAgentMessageKeyForEnglish(typed?.message);

  return workspaceAgentMessage(typed?.publicMessageKey ?? exactKey ?? fallbackKey, locale, typed?.publicMessageValues);
}
