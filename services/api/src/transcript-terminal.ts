import { createHash } from 'node:crypto';
import { z } from 'zod';
import { texteSansReflexion } from './message-ne-raccourcit-pas.js';

/** Observed stream outcome only: never evidence of applied files, a build, billing or permissions. */
export const transcriptTerminalSchema = z
  .object({
    type: z.literal('streamTerminal'),
    contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(['complete', 'incomplete', 'error']),
    finishReason: z.enum(['stop', 'length', 'error', 'unknown', 'content-filter', 'tool-calls', 'other']),
    reason: z.enum([
      'finished',
      'provider-error',
      'unknown-finish',
      'output-limit',
      'open-action',
      'no-files',
      'continuation-error',
    ]),
    segments: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    fileActions: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    openActions: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    openArtifacts: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    messageId: z.string().max(200).optional(),
  })
  .refine(
    (value) =>
      value.status !== 'complete' ||
      (value.finishReason === 'stop' &&
        value.reason === 'finished' &&
        value.openActions === 0 &&
        value.openArtifacts === 0),
  );
export type TranscriptTerminal = z.infer<typeof transcriptTerminalSchema>;
export interface BoundTranscriptTerminal {
  version: 1;
  contentSha256: string;
  receipt: TranscriptTerminal;
}
export function transcriptContentHash(content: string): string {
  return createHash('sha256').update(texteSansReflexion(content)).digest('hex');
}
export function bindTranscriptTerminal(
  content: string,
  receipt: TranscriptTerminal,
  id: string,
): BoundTranscriptTerminal {
  if (receipt.contentSha256 !== transcriptContentHash(content)) {
    throw Object.assign(new Error('TRANSCRIPT_RECEIPT_CONTENT_MISMATCH'), {
      statusCode: 409,
      code: 'TRANSCRIPT_RECEIPT_CONTENT_MISMATCH',
    });
  }

  return {
    version: 1,
    contentSha256: transcriptContentHash(content),
    receipt: { ...transcriptTerminalSchema.parse(receipt), messageId: id },
  };
}
export function readTranscriptTerminal(content: string, bound: unknown, id: string): TranscriptTerminal | undefined {
  if (!bound || typeof bound !== 'object') {
    return undefined;
  }

  const envelope = bound as Partial<BoundTranscriptTerminal>;

  if (envelope.version !== 1 || envelope.contentSha256 !== transcriptContentHash(content)) {
    return undefined;
  }

  const parsed = transcriptTerminalSchema.safeParse(envelope.receipt);

  return parsed.success &&
    parsed.data.contentSha256 === envelope.contentSha256 &&
    (!parsed.data.messageId || parsed.data.messageId === id)
    ? { ...parsed.data, messageId: id }
    : undefined;
}
