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
      }>;
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
    'The AI service returned an invalid response. This may be due to an invalid model name, API rate limiting, or server issues. Try selecting a different model or check your API key.',
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

  if (message.includes('model') && message.includes('not found')) {
    return 'MODEL_NOT_FOUND';
  }

  if (message.includes('Invalid JSON response')) {
    return 'INVALID_RESPONSE';
  }

  if (message.includes('API key') || message.includes('unauthorized') || message.includes('authentication')) {
    return 'AUTH_FAILED';
  }

  if (message.includes('token') && message.includes('limit')) {
    return 'TOKEN_LIMIT';
  }

  if (message.includes('rate limit') || message.includes('429')) {
    return 'RATE_LIMIT';
  }

  if (message.includes('network') || message.includes('timeout')) {
    return 'NETWORK_ERROR';
  }

  return 'UNKNOWN';
}
