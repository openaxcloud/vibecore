import type { ContextAnnotation } from '~/types/context';

export type StreamTerminal = Extract<ContextAnnotation, { type: 'streamTerminal' }>;

const FINISH_REASONS = ['stop', 'length', 'error', 'unknown', 'content-filter', 'tool-calls', 'other'] as const;

const TERMINAL_REASONS = [
  'finished',
  'provider-error',
  'unknown-finish',
  'output-limit',
  'open-action',
  'no-files',
  'continuation-error',
] as const;

/** Protocol tag counts describe emitted text, never successful writes or a verified application. */
export function countOpenStreamBlocks(content: string) {
  let openActions = 0;
  let openArtifacts = 0;

  for (const match of content.matchAll(/<(\/?)(boltAction|boltArtifact)\b[^>]*>/g)) {
    const delta = match[1] ? -1 : 1;

    if (match[2] === 'boltAction') {
      openActions = Math.max(0, openActions + delta);
    } else {
      openArtifacts = Math.max(0, openArtifacts + delta);
    }
  }

  const partial = /<(boltAction|boltArtifact)\b[^>]*$/.exec(content);

  if (partial?.[1] === 'boltAction') {
    openActions++;
  }

  if (partial?.[1] === 'boltArtifact') {
    openArtifacts++;
  }

  return { openActions, openArtifacts };
}

export function createStreamTerminal(input: {
  finishReason: string;
  content: string;
  modeConstruction: boolean;
  fichiersRefuses: boolean;
  segments: number;
  fileActions: number;
  messageId?: string;
  reason?: 'continuation-error';
}): StreamTerminal {
  const finishReason = FINISH_REASONS.find((reason) => reason === input.finishReason) ?? 'unknown';
  const counts = countOpenStreamBlocks(input.content);

  let status: StreamTerminal['status'] = 'incomplete';
  let reason: StreamTerminal['reason'] = 'unknown-finish';

  if (input.reason === 'continuation-error' || finishReason === 'error') {
    status = 'error';
    reason = input.reason ?? 'provider-error';
  } else if (finishReason === 'length') {
    reason = 'output-limit';
  } else if (finishReason === 'stop') {
    if (counts.openActions || counts.openArtifacts) {
      reason = 'open-action';
    } else if (input.modeConstruction && !input.fichiersRefuses && input.fileActions === 0) {
      reason = 'no-files';
    } else {
      status = 'complete';
      reason = 'finished';
    }
  }

  return {
    type: 'streamTerminal',
    status,
    finishReason,
    reason,
    segments: input.segments,
    fileActions: input.fileActions,
    ...counts,
    messageId: input.messageId,
  };
}

/** Ignore malformed receipts and receipts explicitly scoped to another message. */
export function latestStreamTerminal(annotations: unknown, messageId?: string): StreamTerminal | undefined {
  if (!Array.isArray(annotations)) {
    return undefined;
  }

  for (const value of [...annotations].reverse()) {
    if (
      !value ||
      typeof value !== 'object' ||
      value.type !== 'streamTerminal' ||
      !['complete', 'incomplete', 'error'].includes(value.status) ||
      !FINISH_REASONS.includes(value.finishReason) ||
      !TERMINAL_REASONS.includes(value.reason) ||
      !['segments', 'fileActions', 'openActions', 'openArtifacts'].every(
        (key) => Number.isSafeInteger(value[key]) && value[key] >= 0,
      ) ||
      (value.messageId !== undefined && typeof value.messageId !== 'string') ||
      (messageId && value.messageId && messageId !== value.messageId)
    ) {
      continue;
    }

    if (
      value.status === 'complete' &&
      (value.finishReason !== 'stop' || value.reason !== 'finished' || value.openActions || value.openArtifacts)
    ) {
      continue;
    }

    return value as StreamTerminal;
  }

  return undefined;
}
