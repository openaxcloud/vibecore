export type WorkspaceManagerLocale = 'en' | 'fr';

const copy = {
  en: {
    workspaceNotFound: 'Workspace not found',
    workspacePodFailed: 'Workspace pod failed to start',
    workspaceUnschedulable: 'Workspace pod could not be scheduled — no capacity available',
    workspaceOomKilled: 'Workspace pod was OOMKilled — increase the plan memory limit or restart',
    workspaceCrashLoop: 'Workspace pod is crash-looping (CrashLoopBackOff)',
    workspaceContainerFailed: 'Workspace pod could not start its container',
    workspaceStartFailed: 'The workspace could not be started. Please try again.',
    workspaceStartInProgress: 'The workspace is starting. Please try stopping it again in a moment.',
    workspaceStopFailed: 'The workspace could not be stopped. Please try again.',
    workspaceStopInProgress: 'The workspace is stopping. Please try again in a moment.',
    managerNotConfigured: 'The workspace manager is not configured.',
    managerUnauthorized: 'Unauthorized workspace manager request.',
    serverDeploymentNotFound: 'Server deployment not found.',
    workspaceAgentNotFound: 'Workspace agent not found.',
    previewAccessDenied: 'Preview access denied.',
    databaseResourceForbidden: 'This database resource is not permitted.',
    databaseApiVersionForbidden: 'Only CloudNativePG resources are permitted.',
    databaseResourceNotFound: 'Database resource not found.',
    databaseSecretForbidden: 'This database secret is not permitted.',
    databaseSecretNotFound: 'Database secret not found.',
    validationFailed: 'The request is invalid.',
    requestFailed: 'The request could not be completed.',
    internalServerError: 'An internal error occurred. Please try again.',
    previewProxyNotConfigured: 'The preview proxy is not configured.',
    previewProxyUnauthorized: 'Unauthorized preview proxy request.',
  },
  fr: {
    workspaceNotFound: 'Espace de travail introuvable.',
    workspacePodFailed: 'Le démarrage de l’espace de travail a échoué.',
    workspaceUnschedulable: 'L’espace de travail n’a pas pu être planifié, car aucune capacité n’est disponible.',
    workspaceOomKilled:
      'L’espace de travail a manqué de mémoire. Augmentez la limite de mémoire de l’offre ou redémarrez-le.',
    workspaceCrashLoop: 'L’espace de travail redémarre en boucle et n’a pas pu démarrer.',
    workspaceContainerFailed: 'Le conteneur de l’espace de travail n’a pas pu démarrer.',
    workspaceStartFailed: 'L’espace de travail n’a pas pu démarrer. Veuillez réessayer.',
    workspaceStartInProgress:
      'L’espace de travail est en cours de démarrage. Veuillez réessayer de l’arrêter dans un instant.',
    workspaceStopFailed: 'L’espace de travail n’a pas pu être arrêté. Veuillez réessayer.',
    workspaceStopInProgress: 'L’espace de travail est en cours d’arrêt. Veuillez réessayer dans un instant.',
    managerNotConfigured: 'Le gestionnaire d’espaces de travail n’est pas configuré.',
    managerUnauthorized: 'Requête non autorisée vers le gestionnaire d’espaces de travail.',
    serverDeploymentNotFound: 'Déploiement serveur introuvable.',
    workspaceAgentNotFound: 'Agent de l’espace de travail introuvable.',
    previewAccessDenied: 'Accès à l’aperçu refusé.',
    databaseResourceForbidden: 'Cette ressource de base de données n’est pas autorisée.',
    databaseApiVersionForbidden: 'Seules les ressources CloudNativePG sont autorisées.',
    databaseResourceNotFound: 'Ressource de base de données introuvable.',
    databaseSecretForbidden: 'Ce secret de base de données n’est pas autorisé.',
    databaseSecretNotFound: 'Secret de base de données introuvable.',
    validationFailed: 'La requête est invalide.',
    requestFailed: 'La requête n’a pas pu aboutir.',
    internalServerError: 'Une erreur interne est survenue. Veuillez réessayer.',
    previewProxyNotConfigured: 'Le proxy d’aperçu n’est pas configuré.',
    previewProxyUnauthorized: 'Requête non autorisée vers le proxy d’aperçu.',
  },
} as const;

export type WorkspaceManagerMessageKey = keyof (typeof copy)['en'];

export function workspaceManagerMessage(
  key: WorkspaceManagerMessageKey,
  locale: WorkspaceManagerLocale = 'en',
): string {
  return copy[locale]?.[key] ?? copy.en[key];
}

export function workspaceManagerLocaleFromHeader(
  value: string | readonly string[] | null | undefined,
): WorkspaceManagerLocale {
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
      (entry): entry is { locale: WorkspaceManagerLocale; quality: number; index: number } =>
        Boolean(entry.locale) && entry.quality > 0,
    )
    .sort((left, right) => right.quality - left.quality || left.index - right.index)[0];

  return match?.locale ?? 'en';
}

const englishIndex = new Map<string, WorkspaceManagerMessageKey>(
  (Object.keys(copy.en) as WorkspaceManagerMessageKey[]).map((key) => [copy.en[key], key] as const),
);

export function workspaceManagerMessageKeyForEnglish(value: unknown): WorkspaceManagerMessageKey | undefined {
  return typeof value === 'string' ? englishIndex.get(value) : undefined;
}

/** Translate exact platform-owned copy only; Kubernetes/user output is never rewritten. */
export function localizeWorkspaceManagerMessage(value: unknown, locale: WorkspaceManagerLocale): unknown {
  if (typeof value !== 'string' || locale === 'en') {
    return value;
  }

  const key = workspaceManagerMessageKeyForEnglish(value);
  return key ? workspaceManagerMessage(key, locale) : value;
}

export type WorkspaceManagerPublicError = Error & {
  code?: string;
  publicMessageKey?: WorkspaceManagerMessageKey;
  statusCode?: number;
};

export function workspaceManagerError(
  key: WorkspaceManagerMessageKey,
  options: { code?: string; statusCode?: number } = {},
): WorkspaceManagerPublicError {
  return Object.assign(new Error(workspaceManagerMessage(key, 'en')), {
    publicMessageKey: key,
    ...options,
  });
}
