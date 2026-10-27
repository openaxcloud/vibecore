import type { StreamTextOnChunkCallback, ToolSet } from 'ai';

/** Identifies the configured invocation that emitted text, not an attested upstream model identity. */
export type ModelOutputReceipt = Readonly<{
  provider: string;
  model: string;
  evidence: 'text-delta';
  messageId?: string;
}>;

/** One observer per invocation; continuations must create their own observer. */
export function createModelOutputObserver(options: {
  provider: string;
  model: string;
  messageId?: string;
  abortSignal?: AbortSignal;
  onOutput: (receipt: ModelOutputReceipt) => void;
  onChunk?: StreamTextOnChunkCallback<ToolSet>;
}): StreamTextOnChunkCallback<ToolSet> {
  let reported = false;

  return async (event) => {
    await options.onChunk?.(event);

    if (
      reported ||
      options.abortSignal?.aborted ||
      event.chunk.type !== 'text-delta' ||
      event.chunk.textDelta.length === 0
    ) {
      return;
    }

    reported = true;
    options.onOutput({
      provider: options.provider,
      model: options.model,
      evidence: 'text-delta',
      ...(options.messageId === undefined ? {} : { messageId: options.messageId }),
    });
  };
}
