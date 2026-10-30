export type ContextAnnotation =
  | {
      type: 'streamTerminal';
      status: 'complete' | 'incomplete' | 'error';
      finishReason: 'stop' | 'length' | 'error' | 'unknown' | 'content-filter' | 'tool-calls' | 'other';
      reason:
        | 'finished'
        | 'provider-error'
        | 'unknown-finish'
        | 'output-limit'
        | 'open-action'
        | 'no-files'
        | 'continuation-error';
      segments: number;
      fileActions: number;
      openActions: number;
      openArtifacts: number;
      messageId?: string;
    }
  | {
      type: 'codeContext';
      files: string[];
    }
  | {
      type: 'chatSummary';
      summary: string;
      chatId: string;
    }
  | {
      type: 'agentOrchestration';
      mode: 'parallel-subagents' | 'single-model-lanes';
      reason: string;
      roles: Array<{
        id: 'architect' | 'frontend' | 'backend' | 'devops' | 'qa';
        title: string;
        responsibility: string;
      }>;
    }
  | {
      type: 'agentExecution';
      runId: string;
      status: 'complete' | 'partial' | 'failed';
      results: Array<{
        roleId: 'architect' | 'frontend' | 'backend' | 'devops' | 'qa';
        status: 'complete' | 'partial' | 'failed';
        summary: string;
        files?: string[];
        risks?: string[];
        verification?: string[];
        outputState?: 'empty' | 'actions_without_report' | 'report' | 'invalid_report' | 'interrupted';
        emittedFiles?: string[];
        verificationState?: 'not_observed';
      }>;
      consensus?: {
        algorithm: 'QUORUM' | 'BYZANTINE_PBFT' | 'WEIGHTED_PLURALITY';
        outcome: 'ACCEPTED' | 'REJECTED' | 'PARTIAL' | 'ABSTAINED';
        threshold: number;
        agreementScore: number;
        rounds: number;
        durationMs: number;
        claimVotes: Array<{
          claim: string;
          type: 'risk' | 'verification' | 'file';
          supporters: Array<'architect' | 'frontend' | 'backend' | 'devops' | 'qa'>;
          dissenters: Array<'architect' | 'frontend' | 'backend' | 'devops' | 'qa'>;
          agreementRatio: number;
          decision: 'accepted' | 'rejected' | 'inconclusive';
        }>;
        consolidated?: {
          summary: string;
          acceptedRisks: string[];
          acceptedVerification: string[];
          agreedVerificationClaims?: string[];
          acceptedFiles: string[];
          rejectedClaims: Array<{ claim: string; type: 'risk' | 'verification' | 'file' }>;
        };
        conflicts: Array<{
          type: 'file-overlap' | 'risk-disagreement' | 'verification-gap' | 'role-failure';
          description: string;
          involvedRoles: Array<'architect' | 'frontend' | 'backend' | 'devops' | 'qa'>;
          severity: 'low' | 'medium' | 'high';
        }>;
      };
    }
  | {
      type: 'agentPlan';

      /** Whether a tailored, prompt-driven plan was produced (vs. the default full roster). */
      planned: boolean;

      /** Plan mode: this plan is PROPOSED and awaits the user's approval before execution. */
      needsApproval?: boolean;
      tasks: Array<{
        title: string;
        roleId: 'architect' | 'frontend' | 'backend' | 'devops' | 'qa';
      }>;
    }
  | {
      /*
       * Le modèle demandé était indisponible et le repli a été sélectionné.
       * Cela ne prouve pas qu'il ait produit une sortie. Écrit pour que la substitution soit
       * DITE à l'utilisateur, jamais silencieuse (défaut mesuré le 2026-09-28).
       */
      type: 'basculeFournisseur';
      depuis: { provider: string; model: string };
      vers: { provider: string; model: string };
      motif: string;
    }
  | {
      /** A nonempty text delta was observed for this configured call, not a completed response. */
      type: 'modelOutput';
      provider: string;
      model: string;
      evidence: 'text-delta';
      messageId?: string;
    }
  | {
      type: 'agentRules';

      /** Project-relative paths of the rules files (AGENTS.md / .cursorrules) applied. */
      files: string[];
    }
  | {
      type: 'agentMemory';
      memories: Array<{
        id: string;
        scope: string;
        memoryType?: string;
        tags?: string[];
        accessCount?: number;
        summary: string;
        score?: number;
      }>;
    }
  | {
      type: 'agentLaneStream';
      kind: 'start';
      roleId: 'architect' | 'frontend' | 'backend' | 'devops' | 'qa';
      title: string;
    }
  | {
      type: 'agentLaneStream';
      kind: 'delta';
      roleId: 'architect' | 'frontend' | 'backend' | 'devops' | 'qa';
      text: string;
    }
  | {
      type: 'agentLaneStream';
      kind: 'done';
      roleId: 'architect' | 'frontend' | 'backend' | 'devops' | 'qa';
      status: 'complete' | 'partial' | 'failed';
      summary: string;
      outputState?: 'empty' | 'actions_without_report' | 'report' | 'invalid_report' | 'interrupted';
      emittedFiles?: string[];
      verificationState?: 'not_observed';
    };

export type ProgressAnnotation = {
  type: 'progress';
  label: string;
  status: 'in-progress' | 'complete';
  outcome?: 'complete' | 'incomplete' | 'error';
  order: number;
  message: string;
};

export type ToolCallAnnotation = {
  type: 'toolCall';
  toolCallId: string;
  serverName: string;
  toolName: string;
  toolDescription: string;
};

export type StreamErrorCode =
  | 'STREAM_ABORTED'
  | 'MODEL_NOT_FOUND'
  | 'INVALID_RESPONSE'
  | 'PROVIDER_CREDITS_EXHAUSTED'
  | 'AUTH_FAILED'
  | 'TOKEN_LIMIT'
  | 'RATE_LIMIT'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export const streamErrorCodeMessages: Record<StreamErrorCode, string> = {
  STREAM_ABORTED: 'Stream aborted',
  MODEL_NOT_FOUND: 'Invalid model selected. Please check that the model name is correct and available.',
  INVALID_RESPONSE:
    'The AI service or generated files returned invalid JSON. Check the generated file diagnostics and retry after the manifest is repaired.',
  PROVIDER_CREDITS_EXHAUSTED:
    'The AI provider has no available credits. Contact the platform administrator to restore provider service before retrying. Your project plan allowance is separate.',
  AUTH_FAILED: 'Invalid or missing API key. Please check your API key configuration.',
  TOKEN_LIMIT:
    'Token limit exceeded. The conversation is too long for the selected model. Try using a model with larger context window or start a new conversation.',
  RATE_LIMIT: 'API rate limit exceeded. Please wait a moment before trying again.',
  NETWORK_ERROR: 'Network error. Please check your internet connection and try again.',
  UNKNOWN: 'An unknown streaming error occurred.',
};

export function classifyStreamError(error: unknown): StreamErrorCode {
  if (error && typeof error === 'object' && 'name' in error && (error as { name?: string }).name === 'AbortError') {
    return 'STREAM_ABORTED';
  }

  if (hasExhaustedProviderCredits(error)) {
    return 'PROVIDER_CREDITS_EXHAUSTED';
  }

  const message = (error as { message?: string } | undefined)?.message ?? '';
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes('model') && normalizedMessage.includes('not found')) {
    return 'MODEL_NOT_FOUND';
  }

  if (
    normalizedMessage.includes('invalid json') ||
    normalizedMessage.includes('unexpected end of json') ||
    normalizedMessage.includes('json.parse') ||
    normalizedMessage.includes('json response')
  ) {
    return 'INVALID_RESPONSE';
  }

  if (
    normalizedMessage.includes('api key') ||
    normalizedMessage.includes('unauthorized') ||
    normalizedMessage.includes('authentication')
  ) {
    return 'AUTH_FAILED';
  }

  if (normalizedMessage.includes('token') && normalizedMessage.includes('limit')) {
    return 'TOKEN_LIMIT';
  }

  if (normalizedMessage.includes('rate limit') || normalizedMessage.includes('429')) {
    return 'RATE_LIMIT';
  }

  if (normalizedMessage.includes('network') || normalizedMessage.includes('timeout')) {
    return 'NETWORK_ERROR';
  }

  /*
   * Many provider/SDK errors carry the useful signal on a numeric status or a
   * connection code, not in the message text (AWS Bedrock puts it on
   * $metadata.httpStatusCode; node net errors use error.code like ECONNRESET).
   * Inspecting those turns a lot of previously-"UNKNOWN" errors into an
   * actionable, retryable classification.
   */
  const err = (error ?? {}) as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  const status = [err.status, err.statusCode, err.$metadata?.httpStatusCode].find(
    (value): value is number => typeof value === 'number',
  );

  if (status === 429) {
    return 'RATE_LIMIT';
  }

  if (status === 401 || status === 403) {
    return 'AUTH_FAILED';
  }

  if (typeof status === 'number' && status >= 500) {
    return 'NETWORK_ERROR';
  }

  const connCode = typeof err.code === 'string' ? err.code.toUpperCase() : '';

  if (['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN', 'ENOTFOUND'].includes(connCode)) {
    return 'NETWORK_ERROR';
  }

  return 'UNKNOWN';
}

/** Only explicit billing exhaustion counts; rate limits/resource exhaustion do not. */
export function hasExhaustedProviderCredits(error: unknown, depth = 0): boolean {
  if (depth > 4 || error == null) {
    return false;
  }

  if (typeof error === 'string') {
    return /credit balance is too low|prepayment credits are depleted|PROVIDER_CREDITS_EXHAUSTED|insufficient[_ ]quota|billing[_ ]hard[_ ]limit/i.test(
      error,
    );
  }

  if (typeof error !== 'object') {
    return false;
  }

  const record = error as Record<string, unknown>;

  return ['message', 'responseBody', 'body', 'detail', 'error', 'code', 'cause', 'lastError'].some((key) =>
    hasExhaustedProviderCredits(record[key], depth + 1),
  );
}
