export const AI_GATEWAY_LOCALES = ['en', 'fr'] as const;
export type AiGatewayLocale = (typeof AI_GATEWAY_LOCALES)[number];

const copy = {
  en: {
    providerAccountLimit: 'The AI provider account has reached its usage limit.',
    providerRequestFailed: 'The AI provider request failed. Please try again.',
    providerNonJson: 'The AI provider returned an invalid response.',
    providerStreamTimeout: 'The AI provider stream timed out.',
    providerRequired: 'Select a provider when using a model that is not in the catalog.',
    modelPlanBlocked: 'This model is not available on your plan.',
    providerModelPlanBlocked: 'No model from this provider is available on your plan.',
    providerUnavailable: 'No configured AI provider is available.',
    providerStreamFailed: 'The AI provider stream failed. Please try again.',
    modelUnknown: 'The model "{model}" is not in the AI gateway catalog.',
    agentEmptyResponse: 'The agent returned an empty response.',
    consensusEmptySummary: 'No sub-agent produced a usable summary.',
    consensusFileOverlap: 'Sub-agents claiming ownership of {path}: {count}.',
    consensusRiskDisagreement: 'Risk "{risk}" — reporting roles: {supporters}; other roles: {dissenters}.',
    consensusVerificationGap: 'Sub-agents without verification steps: {missing} of {total}.',
    consensusRoleFailure: 'Failed sub-agent roles ({count}): {roles}.',
    requestBodyObject: 'The request body must be an object.',
    agentModeInvalid: 'mode must be parallel-subagents.',
    rolesRequired: 'roles must include at least one supported agent role.',
    rolesMaximum: 'roles cannot include more than {maximum} entries.',
    rolesDuplicate: 'roles must not contain duplicate role ids.',
    messagesRequired: 'messages must include at least one chat message.',
    messagesMaximum: 'messages cannot include more than {maximum} entries.',
    messagesCharactersMaximum: 'messages cannot exceed {maximum} characters.',
    subagentStreamError: 'A sub-agent stream failed.',
    agentExecutionFailed: 'Agent execution failed.',
    gatewayUnauthorized: 'Unauthorized AI gateway request.',
    chatMessagesRequired: 'messages is required.',
    aiStreamFailed: 'The AI stream failed. Please try again.',
    completionFailed: 'The completion failed. Please try again.',
    executorUnauthorized: 'Unauthorized agent executor request.',
    executorRateLimited: 'The agent executor rate limit was exceeded. Please try again later.',
    agentRunFailed: 'The agent run failed. Please try again.',
  },
  fr: {
    providerAccountLimit: 'Le compte du fournisseur d’IA a atteint sa limite d’utilisation.',
    providerRequestFailed: 'La requête adressée au fournisseur d’IA a échoué. Veuillez réessayer.',
    providerNonJson: 'Le fournisseur d’IA a renvoyé une réponse invalide.',
    providerStreamTimeout: 'Le flux du fournisseur d’IA a dépassé le délai autorisé.',
    providerRequired: 'Sélectionnez un fournisseur pour utiliser un modèle absent du catalogue.',
    modelPlanBlocked: 'Ce modèle n’est pas disponible avec votre offre.',
    providerModelPlanBlocked: 'Aucun modèle de ce fournisseur n’est disponible avec votre offre.',
    providerUnavailable: 'Aucun fournisseur d’IA configuré n’est disponible.',
    providerStreamFailed: 'Le flux du fournisseur d’IA a échoué. Veuillez réessayer.',
    modelUnknown: 'Le modèle « {model} » ne figure pas dans le catalogue de la passerelle d’IA.',
    agentEmptyResponse: 'L’agent a renvoyé une réponse vide.',
    consensusEmptySummary: 'Aucun sous-agent n’a produit de synthèse exploitable.',
    consensusFileOverlap: '{count} sous-agents revendiquent le fichier {path}.',
    consensusRiskDisagreement:
      'Risque « {risk} » — rôles l’ayant signalé : {supporters} ; autres rôles : {dissenters}.',
    consensusVerificationGap: 'Sous-agents sans étape de vérification : {missing} sur {total}.',
    consensusRoleFailure: 'Rôles de sous-agents en échec ({count}) : {roles}.',
    requestBodyObject: 'Le corps de la requête doit être un objet.',
    agentModeInvalid: 'Le champ mode doit valoir parallel-subagents.',
    rolesRequired: 'Le champ roles doit contenir au moins un rôle d’agent pris en charge.',
    rolesMaximum: 'Le champ roles ne peut pas contenir plus de {maximum} entrées.',
    rolesDuplicate: 'Le champ roles ne doit pas contenir d’identifiants de rôle en double.',
    messagesRequired: 'Le champ messages doit contenir au moins un message de chat.',
    messagesMaximum: 'Le champ messages ne peut pas contenir plus de {maximum} entrées.',
    messagesCharactersMaximum: 'Le champ messages ne peut pas dépasser {maximum} caractères.',
    subagentStreamError: 'Le flux d’un sous-agent a échoué.',
    agentExecutionFailed: 'L’exécution de l’agent a échoué.',
    gatewayUnauthorized: 'Requête non autorisée vers la passerelle d’IA.',
    chatMessagesRequired: 'Le champ messages est requis.',
    aiStreamFailed: 'Le flux d’IA a échoué. Veuillez réessayer.',
    completionFailed: 'La complétion a échoué. Veuillez réessayer.',
    executorUnauthorized: 'Requête non autorisée vers l’exécuteur d’agents.',
    executorRateLimited: 'La limite de requêtes de l’exécuteur d’agents a été dépassée. Veuillez réessayer plus tard.',
    agentRunFailed: 'L’exécution de l’agent a échoué. Veuillez réessayer.',
  },
} as const;

export type AiGatewayMessageKey = keyof (typeof copy)['en'];
type MessageValues = Readonly<Record<string, string | number | null | undefined>>;

export function normalizeAiGatewayLocale(value: unknown): AiGatewayLocale | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const primary = value.trim().toLowerCase().split(/[-_]/)[0];
  return primary === 'fr' ? 'fr' : primary === 'en' ? 'en' : undefined;
}

export function aiGatewayLocaleFromHeader(value: string | readonly string[] | null | undefined): AiGatewayLocale {
  const header = typeof value === 'string' ? value : value ? [...value].join(',') : '';
  const match = header
    .split(',')
    .map((entry, index) => {
      const [tag, ...parameters] = entry.trim().split(';');
      const qualityValue = parameters.find((parameter) => parameter.trim().toLowerCase().startsWith('q='));
      const quality = qualityValue ? Number.parseFloat(qualityValue.trim().slice(2)) : 1;
      return { locale: normalizeAiGatewayLocale(tag), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter(
      (entry): entry is { locale: AiGatewayLocale; quality: number; index: number } =>
        Boolean(entry.locale) && entry.quality > 0,
    )
    .sort((left, right) => right.quality - left.quality || left.index - right.index)[0];

  return match?.locale ?? 'en';
}

export function aiGatewayMessage(
  key: AiGatewayMessageKey,
  locale: AiGatewayLocale = 'en',
  values: MessageValues = {},
): string {
  const template = copy[locale]?.[key] ?? copy.en[key];
  return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (_placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name] ?? '') : '',
  );
}

export type AiGatewayPublicError = Error & {
  publicMessageKey?: AiGatewayMessageKey;
  publicMessageValues?: MessageValues;
  statusCode?: number;
  code?: string;
};

export function aiGatewayError(
  key: AiGatewayMessageKey,
  options: { statusCode?: number; code?: string; values?: MessageValues } = {},
): AiGatewayPublicError {
  return Object.assign(new Error(aiGatewayMessage(key, 'en', options.values)), {
    publicMessageKey: key,
    publicMessageValues: options.values,
    statusCode: options.statusCode,
    code: options.code,
  });
}

export function localizedAiGatewayError(
  error: unknown,
  locale: AiGatewayLocale,
  fallbackKey: AiGatewayMessageKey,
): string {
  const typed = error as AiGatewayPublicError | undefined;
  return aiGatewayMessage(typed?.publicMessageKey ?? fallbackKey, locale, typed?.publicMessageValues);
}
