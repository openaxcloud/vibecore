import type { StreamErrorCode } from '~/types/context';

export const API_CHAT_PROGRESS_LABELS = {
  context: 'context',
  orchestration: 'orchestration',
  portfolioTemplate: 'portfolio-template',
  quotaExceeded: 'quota-exceeded',
  response: 'response',
  summary: 'summary',
} as const;

export const apiChatCatalog = {
  en: {
    analysisComplete: 'Analysis Complete',
    analysingRequest: 'Analysing Request',
    agentExecutionFailed: 'This specialist agent could not complete its task.',
    codeFilesSelected: 'Code Files Selected',
    conflictFileOverlapOne: '1 sub-agent claims ownership of {file}',
    conflictFileOverlapOther: '{count} sub-agents claim ownership of {file}',
    conflictRiskDisagreementOneOne: 'Risk “{risk}” was raised by 1 role and not retained by 1 other role',
    conflictRiskDisagreementOneOther: 'Risk “{risk}” was raised by 1 role and not retained by {dissenters} other roles',
    conflictRiskDisagreementOtherOne: 'Risk “{risk}” was raised by {supporters} roles and not retained by 1 other role',
    conflictRiskDisagreementOtherOther:
      'Risk “{risk}” was raised by {supporters} roles and not retained by {dissenters} other roles',
    conflictRoleFailureOne: '1 sub-agent role failed: {roles}',
    conflictRoleFailureOther: '{count} sub-agent roles failed: {roles}',
    conflictVerificationGapOne: '1 of {total} sub-agents produced no verification steps',
    conflictVerificationGapOther: '{count} of {total} sub-agents produced no verification steps',
    connectorReason:
      'The request mentions {provider}. Connect it so the agent can read or write {provider} data on your behalf.',
    connectorScopeRepositories: 'Repositories',
    connectorScopeRepositoriesDescription: 'Read and write to your repositories.',
    connectorScopeOrganizations: 'Organizations',
    connectorScopeOrganizationsDescription: 'Read the organizations you belong to.',
    connectorScopeProfile: 'Profile',
    connectorScopeProfileDescription: 'Read your public profile.',
    connectorScopeEmail: 'Email',
    connectorScopeEmailDescription: 'Read your primary email address.',
    contextOptimizationSkipped: 'Context optimization skipped',
    determiningFilesToRead: 'Determining Files to Read',
    entitlementsUnavailable:
      'Your plan permissions could not be verified right now. Try again in a moment; no Agent run was started.',
    executingSpecialistLanes: 'Executing specialist agent lanes',
    generatingResponse: 'Generating Response',
    invalidApiKey: 'Invalid or missing API key',
    invalidJsonBody: 'Invalid JSON body',
    loadedPortfolioTemplate: 'Loaded cached portfolio template',
    modeUnavailable: 'This agent mode is not available on your plan.',
    noFilesGenerated:
      'No files were generated — this model did not emit any file actions. Pick a more capable model (e.g. GPT-4o or Claude Sonnet) and try again.',
    orchestrationComplexReason:
      'Complex build request detected; split the work into specialist lanes and integrate the result before responding.',
    orchestrationFallbackAggregate:
      'Streaming specialist execution failed. Falling back to aggregate sub-agent execution.',
    orchestrationFallbackSingle: 'Sub-agent execution failed. Falling back to single-model lanes.',
    orchestrationGenericReason: 'The request is being handled by specialist agent lanes.',
    orchestrationSingleReason: 'Single-lane response is sufficient for this request.',
    plannedAgentLanes: 'Agent lanes planned: {roles}',
    planReady: 'Plan ready — approve to build',
    quotaExceeded:
      'The AI usage quota for this organization has been reached. Try again after it resets or change your plan.',
    responseGenerated: 'Response Generated',
    runAlreadyStarted:
      'This Agent turn is already running or awaiting billing recovery. Wait for it to finish before retrying.',
    responseInterrupted: 'Response interrupted: continuation failed',
    responseTruncatedNoContent: 'Response truncated: model returned no further content',
    responseTruncatedSegments: 'Response truncated: maximum continuation segments reached',
    roleArchitectResponsibility:
      'Define system architecture, data model, API contracts, state boundaries, and integration order.',
    roleArchitectTitle: 'Architect',
    roleBackendResponsibility:
      'Build API routes, validation, persistence adapters, auth/session boundaries, realtime handlers, and server-side error handling.',
    roleBackendTitle: 'Backend',
    roleDatabaseResponsibility:
      'Design durable schemas and migrations, transactional invariants, tenant-scoped queries, retention, backups, and rollback-safe data changes.',
    roleDatabaseTitle: 'Database',
    roleDevopsResponsibility:
      'Create runtime scripts, dependency setup, environment examples, build config, and deploy configuration.',
    roleDevopsTitle: 'DevOps',
    roleFrontendResponsibility:
      'Build UI components, pages, layouts, state management, accessibility, responsive behavior, loading states, and error states.',
    roleFrontendTitle: 'Frontend',
    roleAccessibilityResponsibility:
      'Verify WCAG AA semantics, keyboard and screen-reader behavior, responsive layouts, localization, contrast, and reduced-motion behavior.',
    roleAccessibilityTitle: 'Accessibility',
    rolePerformanceResponsibility:
      'Profile critical paths, bound expensive work, tune caching and concurrency, and prevent latency, memory, and resource regressions.',
    rolePerformanceTitle: 'Performance',
    roleQaResponsibility:
      'Write critical-path tests, verify build/typecheck, inspect preview behavior, and fix failures.',
    roleQaTitle: 'QA',
    roleReviewerResponsibility:
      'Review cross-lane integration, contracts, failure modes, security and data boundaries, then close release-blocking regressions.',
    roleReviewerTitle: 'Reviewer',
    roleSecurityResponsibility:
      'Threat-model the change and enforce authentication, authorization, tenant isolation, secure defaults, secret handling, and auditable controls.',
    roleSecurityTitle: 'Security',
    spendLimitReached: 'You have reached your personal AI spending limit for this billing period.',
    streamAuthFailed: 'Invalid or missing API key. Please check your API key configuration.',
    streamInvalidResponse:
      'The AI service or generated files returned invalid JSON. Check the generated file diagnostics and retry after the manifest is repaired.',
    streamModelNotFound: 'Invalid model selected. Please check that the model name is correct and available.',
    streamNetworkError: 'Network error. Please check your internet connection and try again.',
    streamRateLimit: 'API rate limit exceeded. Please wait a moment before trying again.',
    streamStopped: 'Stream aborted',
    streamTokenLimit:
      'Token limit exceeded. The conversation is too long for the selected model. Try using a model with a larger context window or start a new conversation.',
    streamUnknown: 'An unexpected streaming error occurred.',
    usageSettlementUnavailable:
      'The response could not be finalized because usage settlement is temporarily unavailable. Your run is protected and will be recovered automatically.',
    streamingPortfolioFiles: 'Streaming cached portfolio files',
    unexpectedError: 'An unexpected error occurred',
  },
  fr: {
    analysisComplete: 'Analyse terminée',
    analysingRequest: 'Analyse de la demande',
    agentExecutionFailed: 'Cet agent spécialisé n’a pas pu terminer sa tâche.',
    codeFilesSelected: 'Fichiers de code sélectionnés',
    conflictFileOverlapOne: '1 sous-agent revendique le fichier {file}',
    conflictFileOverlapOther: '{count} sous-agents revendiquent le fichier {file}',
    conflictRiskDisagreementOneOne: 'Le risque « {risk} » a été signalé par 1 rôle et écarté par 1 autre rôle',
    conflictRiskDisagreementOneOther:
      'Le risque « {risk} » a été signalé par 1 rôle et écarté par {dissenters} autres rôles',
    conflictRiskDisagreementOtherOne:
      'Le risque « {risk} » a été signalé par {supporters} rôles et écarté par 1 autre rôle',
    conflictRiskDisagreementOtherOther:
      'Le risque « {risk} » a été signalé par {supporters} rôles et écarté par {dissenters} autres rôles',
    conflictRoleFailureOne: '1 rôle de sous-agent en échec : {roles}',
    conflictRoleFailureOther: '{count} rôles de sous-agent en échec : {roles}',
    conflictVerificationGapOne: '1 sous-agent sur {total} n’a fourni aucune étape de vérification',
    conflictVerificationGapOther: '{count} sous-agents sur {total} n’ont fourni aucune étape de vérification',
    connectorReason:
      'La demande mentionne {provider}. Connectez ce service pour permettre à l’agent de lire ou de modifier les données {provider} en votre nom.',
    connectorScopeRepositories: 'Dépôts',
    connectorScopeRepositoriesDescription: 'Lire et modifier vos dépôts.',
    connectorScopeOrganizations: 'Organisations',
    connectorScopeOrganizationsDescription: 'Lire les organisations auxquelles vous appartenez.',
    connectorScopeProfile: 'Profil',
    connectorScopeProfileDescription: 'Lire votre profil public.',
    connectorScopeEmail: 'Adresse e-mail',
    connectorScopeEmailDescription: 'Lire votre adresse e-mail principale.',
    contextOptimizationSkipped: 'Optimisation du contexte ignorée',
    determiningFilesToRead: 'Sélection des fichiers à lire',
    entitlementsUnavailable:
      'Impossible de vérifier les autorisations de votre offre pour le moment. Réessayez dans un instant ; aucune exécution Agent n’a été lancée.',
    executingSpecialistLanes: 'Exécution des agents spécialisés',
    generatingResponse: 'Génération de la réponse',
    invalidApiKey: 'Clé API absente ou invalide',
    invalidJsonBody: 'Corps JSON invalide',
    loadedPortfolioTemplate: 'Modèle de portfolio en cache chargé',
    modeUnavailable: 'Ce mode agent n’est pas disponible avec votre forfait.',
    noFilesGenerated:
      'Aucun fichier n’a été généré : ce modèle n’a produit aucune action sur les fichiers. Sélectionnez un modèle plus performant, par exemple GPT-4o ou Claude Sonnet, puis réessayez.',
    orchestrationComplexReason:
      'Une demande de création complexe a été détectée ; le travail est réparti entre des agents spécialisés avant l’intégration de leur résultat.',
    orchestrationFallbackAggregate:
      'L’exécution en direct des agents spécialisés a échoué. Passage à l’exécution agrégée des sous-agents.',
    orchestrationFallbackSingle: 'L’exécution des sous-agents a échoué. Passage à une exécution par un seul modèle.',
    orchestrationGenericReason: 'La demande est prise en charge par des agents spécialisés.',
    orchestrationSingleReason: 'Un seul agent suffit pour traiter cette demande.',
    plannedAgentLanes: 'Agents spécialisés planifiés : {roles}',
    planReady: 'Plan prêt — approuvez-le pour lancer la création',
    quotaExceeded:
      'Le quota d’utilisation de l’IA de votre organisation est atteint. Réessayez après sa réinitialisation ou modifiez votre forfait.',
    responseGenerated: 'Réponse générée',
    runAlreadyStarted:
      'Ce tour Agent est déjà en cours ou attend une reprise de facturation. Attendez sa fin avant de réessayer.',
    responseInterrupted: 'Réponse interrompue : la reprise a échoué',
    responseTruncatedNoContent: 'Réponse tronquée : le modèle n’a renvoyé aucun contenu supplémentaire',
    responseTruncatedSegments: 'Réponse tronquée : le nombre maximal de reprises est atteint',
    roleArchitectResponsibility:
      'Définir l’architecture du système, le modèle de données, les contrats API, les limites d’état et l’ordre d’intégration.',
    roleArchitectTitle: 'Architecte',
    roleBackendResponsibility:
      'Construire les routes API, la validation, la persistance, les limites d’authentification et de session, le temps réel et la gestion des erreurs serveur.',
    roleBackendTitle: 'Backend',
    roleDatabaseResponsibility:
      'Concevoir des schémas et migrations durables, les invariants transactionnels, les requêtes isolées par tenant, la rétention, les sauvegardes et les retours arrière sûrs.',
    roleDatabaseTitle: 'Base de données',
    roleDevopsResponsibility:
      'Créer les scripts d’exécution, la configuration des dépendances, les exemples d’environnement, le build et le déploiement.',
    roleDevopsTitle: 'DevOps',
    roleFrontendResponsibility:
      'Construire les composants, pages, mises en page, états, comportements accessibles et responsifs, ainsi que les états de chargement et d’erreur.',
    roleFrontendTitle: 'Frontend',
    roleAccessibilityResponsibility:
      'Vérifier la conformité WCAG AA, le clavier, les lecteurs d’écran, le responsive, la localisation, les contrastes et la réduction des animations.',
    roleAccessibilityTitle: 'Accessibilité',
    rolePerformanceResponsibility:
      'Profiler les parcours critiques, borner les travaux coûteux, régler le cache et la concurrence, et prévenir les régressions de latence, mémoire et ressources.',
    rolePerformanceTitle: 'Performance',
    roleQaResponsibility:
      'Écrire les tests des parcours critiques, vérifier le build et le typage, contrôler la preview et corriger les échecs.',
    roleQaTitle: 'QA',
    roleReviewerResponsibility:
      'Réviser l’intégration entre agents, les contrats, les modes d’échec et les frontières de sécurité et de données, puis corriger les régressions bloquantes.',
    roleReviewerTitle: 'Révision',
    roleSecurityResponsibility:
      'Modéliser les menaces et imposer l’authentification, les autorisations, l’isolation des tenants, les valeurs sûres, la gestion des secrets et des contrôles auditables.',
    roleSecurityTitle: 'Sécurité',
    spendLimitReached: 'Vous avez atteint votre plafond personnel de dépenses IA pour cette période de facturation.',
    streamAuthFailed: 'Clé API absente ou invalide. Vérifiez la configuration de votre clé API.',
    streamInvalidResponse:
      'Le service d’IA ou les fichiers générés ont renvoyé un JSON invalide. Consultez les diagnostics des fichiers générés, corrigez le manifeste, puis réessayez.',
    streamModelNotFound: 'Le modèle sélectionné est invalide. Vérifiez son nom et sa disponibilité.',
    streamNetworkError: 'Erreur réseau. Vérifiez votre connexion Internet, puis réessayez.',
    streamRateLimit: 'Limite de requêtes API atteinte. Patientez un instant, puis réessayez.',
    streamStopped: 'Génération interrompue',
    streamTokenLimit:
      'Limite de tokens dépassée. La conversation est trop longue pour le modèle sélectionné. Choisissez un modèle avec une fenêtre de contexte plus grande ou démarrez une nouvelle conversation.',
    streamUnknown: 'Une erreur inattendue est survenue pendant la génération.',
    usageSettlementUnavailable:
      'La réponse n’a pas pu être finalisée car le règlement de l’usage est temporairement indisponible. Votre exécution est protégée et sera reprise automatiquement.',
    streamingPortfolioFiles: 'Diffusion des fichiers du portfolio en cache',
    unexpectedError: 'Une erreur inattendue est survenue',
  },
} as const;

export type ApiChatCopyKey = keyof typeof apiChatCatalog.en;
export type ApiChatCopy = Readonly<Record<ApiChatCopyKey, string>>;

export type ApiChatLanguage = 'en' | 'fr';
export type ApiChatRoleId =
  | 'architect'
  | 'frontend'
  | 'backend'
  | 'database'
  | 'security'
  | 'devops'
  | 'performance'
  | 'accessibility'
  | 'qa'
  | 'reviewer';
export type ApiChatConflict = Readonly<{
  type: 'file-overlap' | 'risk-disagreement' | 'verification-gap' | 'role-failure';
  description: string;
  involvedRoles: readonly ApiChatRoleId[];
}>;

const STREAM_ERROR_COPY_KEYS: Record<StreamErrorCode, ApiChatCopyKey> = {
  AUTH_FAILED: 'streamAuthFailed',
  INVALID_RESPONSE: 'streamInvalidResponse',
  MODEL_NOT_FOUND: 'streamModelNotFound',
  NETWORK_ERROR: 'streamNetworkError',
  RATE_LIMIT: 'streamRateLimit',
  STREAM_ABORTED: 'streamStopped',
  TOKEN_LIMIT: 'streamTokenLimit',
  UNKNOWN: 'streamUnknown',
};

const ROLE_COPY_KEYS: Record<ApiChatRoleId, { title: ApiChatCopyKey; responsibility: ApiChatCopyKey }> = {
  architect: { title: 'roleArchitectTitle', responsibility: 'roleArchitectResponsibility' },
  accessibility: { title: 'roleAccessibilityTitle', responsibility: 'roleAccessibilityResponsibility' },
  backend: { title: 'roleBackendTitle', responsibility: 'roleBackendResponsibility' },
  database: { title: 'roleDatabaseTitle', responsibility: 'roleDatabaseResponsibility' },
  devops: { title: 'roleDevopsTitle', responsibility: 'roleDevopsResponsibility' },
  frontend: { title: 'roleFrontendTitle', responsibility: 'roleFrontendResponsibility' },
  performance: { title: 'rolePerformanceTitle', responsibility: 'rolePerformanceResponsibility' },
  qa: { title: 'roleQaTitle', responsibility: 'roleQaResponsibility' },
  reviewer: { title: 'roleReviewerTitle', responsibility: 'roleReviewerResponsibility' },
  security: { title: 'roleSecurityTitle', responsibility: 'roleSecurityResponsibility' },
};

function normalizeApiChatLanguage(language: string | null | undefined): ApiChatLanguage {
  return language?.trim().toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

/** English is always the final runtime fallback if a French catalogue entry is absent. */
export function getApiChatCopy(
  language: string | null | undefined,
  frenchCatalogue: Partial<ApiChatCopy> = apiChatCatalog.fr,
): ApiChatCopy {
  return normalizeApiChatLanguage(language) === 'fr' ? { ...apiChatCatalog.en, ...frenchCatalogue } : apiChatCatalog.en;
}

export function formatApiChatCopy(
  language: string | null | undefined,
  key: ApiChatCopyKey,
  parameters: Readonly<Record<string, string | number>> = {},
): string {
  const template = getApiChatCopy(language)[key] ?? apiChatCatalog.en[key] ?? apiChatCatalog.en.unexpectedError;

  return template.replace(/\{([a-zA-Z0-9_]+)\}/gu, (token, name: string) =>
    Object.hasOwn(parameters, name) ? String(parameters[name]) : token,
  );
}

export function localizeApiChatRole<T extends { id: ApiChatRoleId; title: string; responsibility: string }>(
  language: string | null | undefined,
  role: T,
): T {
  const keys = ROLE_COPY_KEYS[role.id];
  const copy = getApiChatCopy(language);

  return { ...role, title: copy[keys.title], responsibility: copy[keys.responsibility] };
}

export function localizeApiChatRoleTitle(
  language: string | null | undefined,
  roleId: ApiChatRoleId,
  englishTitle: string,
): string {
  if (normalizeApiChatLanguage(language) !== 'fr') {
    return englishTitle;
  }

  return getApiChatCopy(language)[ROLE_COPY_KEYS[roleId].title];
}

export function localizeApiChatOrchestrationReason(language: string | null | undefined, reason: string): string {
  if (normalizeApiChatLanguage(language) !== 'fr') {
    return reason;
  }

  const copy = getApiChatCopy(language);

  if (reason === apiChatCatalog.en.orchestrationComplexReason) {
    return copy.orchestrationComplexReason;
  }

  if (reason === apiChatCatalog.en.orchestrationSingleReason) {
    return copy.orchestrationSingleReason;
  }

  if (reason.includes('aggregate sub-agent execution')) {
    return copy.orchestrationFallbackAggregate;
  }

  if (reason.includes('single-model lanes')) {
    return copy.orchestrationFallbackSingle;
  }

  return copy.orchestrationGenericReason;
}

/** Never expose provider/SDK details to the French UI; stable codes remain unchanged. */
export function localizeApiChatStreamError(
  language: string | null | undefined,
  code: StreamErrorCode,
  englishMessage: string,
): string {
  if (normalizeApiChatLanguage(language) !== 'fr') {
    return englishMessage || getApiChatCopy('en')[STREAM_ERROR_COPY_KEYS[code]];
  }

  return getApiChatCopy(language)[STREAM_ERROR_COPY_KEYS[code]];
}

export function localizeApiChatQuotaError(
  language: string | null | undefined,
  code: string,
  englishMessage: string,
): string {
  if (normalizeApiChatLanguage(language) !== 'fr') {
    return englishMessage || apiChatCatalog.en.quotaExceeded;
  }

  const copy = getApiChatCopy(language);

  if (code === 'USER_SPEND_LIMIT_REACHED') {
    return copy.spendLimitReached;
  }

  return code === 'PLAN_ENTITLEMENT_CHECK_UNAVAILABLE' ? copy.entitlementsUnavailable : copy.quotaExceeded;
}

export function localizeApiChatModeError(language: string | null | undefined, englishMessage: string): string {
  return normalizeApiChatLanguage(language) === 'fr'
    ? getApiChatCopy(language).modeUnavailable
    : englishMessage || apiChatCatalog.en.modeUnavailable;
}

export function localizeApiChatAgentResultSummary(
  language: string | null | undefined,
  status: 'complete' | 'partial' | 'failed',
  summary: string,
): string {
  return normalizeApiChatLanguage(language) === 'fr' && status === 'failed'
    ? getApiChatCopy(language).agentExecutionFailed
    : summary;
}

/** Translate known consensus framing while preserving model claims, file paths, role IDs, and other user data. */
export function localizeApiChatConflictDescription(
  language: string | null | undefined,
  conflict: ApiChatConflict,
): string {
  if (normalizeApiChatLanguage(language) !== 'fr') {
    return conflict.description;
  }

  const fileOverlap = conflict.description.match(/^(\d+) sub-agents? claim(?:s)? ownership of (.+)$/u);

  if (conflict.type === 'file-overlap' && fileOverlap) {
    const count = Number(fileOverlap[1]);

    return formatApiChatCopy(language, count === 1 ? 'conflictFileOverlapOne' : 'conflictFileOverlapOther', {
      count,
      file: fileOverlap[2] ?? '',
    });
  }

  const riskDisagreement = conflict.description.match(
    /^Risk "([\s\S]*)" raised by (\d+) role\(s\) but ignored by (\d+) other\(s\)$/u,
  );

  if (conflict.type === 'risk-disagreement' && riskDisagreement) {
    const supporters = Number(riskDisagreement[2]);
    const dissenters = Number(riskDisagreement[3]);

    const key =
      supporters === 1
        ? dissenters === 1
          ? 'conflictRiskDisagreementOneOne'
          : 'conflictRiskDisagreementOneOther'
        : dissenters === 1
          ? 'conflictRiskDisagreementOtherOne'
          : 'conflictRiskDisagreementOtherOther';

    return formatApiChatCopy(language, key, {
      risk: riskDisagreement[1] ?? '',
      supporters,
      dissenters,
    });
  }

  const verificationGap = conflict.description.match(/^(\d+) of (\d+) sub-agents produced no verification steps$/u);

  if (conflict.type === 'verification-gap' && verificationGap) {
    const count = Number(verificationGap[1]);

    return formatApiChatCopy(language, count === 1 ? 'conflictVerificationGapOne' : 'conflictVerificationGapOther', {
      count,
      total: verificationGap[2] ?? '0',
    });
  }

  if (conflict.type === 'role-failure') {
    const count = conflict.involvedRoles.length;

    return formatApiChatCopy(language, count === 1 ? 'conflictRoleFailureOne' : 'conflictRoleFailureOther', {
      count,
      roles: conflict.involvedRoles.join(', '),
    });
  }

  return conflict.description;
}
