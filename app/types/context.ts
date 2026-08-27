export type AgentRoleId =
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

export type ContextAnnotation =
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
        id: AgentRoleId;
        title: string;
        responsibility: string;
      }>;
    }
  | {
      type: 'agentExecution';
      runId: string;
      status: 'complete' | 'partial' | 'failed';
      results: Array<{
        roleId: AgentRoleId;
        status: 'complete' | 'partial' | 'failed';
        summary: string;
        files?: string[];
        risks?: string[];
        verification?: string[];
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
          supporters: AgentRoleId[];
          dissenters: AgentRoleId[];
          agreementRatio: number;
          decision: 'accepted' | 'rejected' | 'inconclusive';
        }>;
        conflicts: Array<{
          type: 'file-overlap' | 'risk-disagreement' | 'verification-gap' | 'role-failure';
          description: string;
          involvedRoles: AgentRoleId[];
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
        roleId: AgentRoleId;
      }>;
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
      roleId: AgentRoleId;
      title: string;
    }
  | {
      type: 'agentLaneStream';
      kind: 'delta';
      roleId: AgentRoleId;
      text: string;
    }
  | {
      type: 'agentLaneStream';
      kind: 'done';
      roleId: AgentRoleId;
      status: 'complete' | 'partial' | 'failed';
      summary: string;
    };

export type ProgressAnnotation = {
  type: 'progress';
  label: string;
  status: 'in-progress' | 'complete';
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
