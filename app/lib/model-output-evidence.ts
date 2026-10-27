import type { ContextAnnotation } from '~/types/context';

type ModelOutput = Extract<ContextAnnotation, { type: 'modelOutput' }>;

/** Latest text receipt for this message; a routing selection is never output evidence. */
export function latestModelOutput(
  annotations: readonly unknown[] | undefined,
  messageId?: string,
): ModelOutput | undefined {
  for (const annotation of [...(annotations ?? [])].reverse()) {
    if (!annotation || typeof annotation !== 'object') {
      continue;
    }

    const value = annotation as Record<string, unknown>;

    if (
      value.type === 'modelOutput' &&
      value.evidence === 'text-delta' &&
      typeof value.provider === 'string' &&
      value.provider.trim() &&
      typeof value.model === 'string' &&
      value.model.trim() &&
      (value.messageId === undefined || (typeof value.messageId === 'string' && value.messageId === messageId))
    ) {
      return value as ModelOutput;
    }
  }
  return undefined;
}

/** Do not reuse an earlier turn's model receipt for a newly selected provider. */
export function latestTurnModelOutput(
  messages: readonly { id?: string; role: string; annotations?: readonly unknown[] }[],
) {
  for (const message of [...messages].reverse()) {
    if (message.role === 'user') {
      return undefined;
    }

    if (message.role !== 'assistant') {
      continue;
    }

    const receipt = latestModelOutput(message.annotations, message.id);

    if (receipt) {
      return receipt;
    }
  }
  return undefined;
}
