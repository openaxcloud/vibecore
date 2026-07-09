import { createHash } from 'node:crypto';
import type { FileMap } from './constants';

/**
 * Wave A / A1 — gate the two extra per-turn LLM calls (chat summary + context
 * selection) so they only fire when they actually change what the main call
 * sends. Both helpers are pure/deterministic; the selection memo is an in-process
 * LRU keyed by conversation, and a miss simply recomputes (never a regression).
 */

/** Default token estimate above which the history is worth summarising. */
export const SUMMARY_TOKEN_THRESHOLD = 6000;

/** Bounded number of conversations kept in the selection memo (LRU). */
export const SELECTION_CACHE_MAX = 200;

/**
 * Cheap, deterministic token estimate (≈ chars / 4). Used only to decide whether
 * the history is large enough that a summary is worthwhile — never for billing.
 */
export function estimateMessagesTokens(messages: Array<{ content?: unknown; parts?: unknown }>): number {
  let chars = 0;

  for (const message of messages) {
    if (typeof message.content === 'string') {
      chars += message.content.length;
    } else if (message.content != null) {
      chars += JSON.stringify(message.content).length;
    }

    if (Array.isArray((message as { parts?: unknown }).parts)) {
      chars += JSON.stringify((message as { parts?: unknown }).parts).length;
    }
  }

  return Math.ceil(chars / 4);
}

/**
 * True when the chat history is long enough that summarising it is worthwhile.
 * Below the threshold the recent-message window is already sent to the model in
 * full, so a summary would be redundant (and the summary LLM call pure overhead).
 */
export function shouldGenerateSummary(opts: {
  messageCount: number;
  recentWindow: number;
  estimatedTokens: number;
  threshold?: number;
}): boolean {
  const threshold = opts.threshold ?? SUMMARY_TOKEN_THRESHOLD;
  return opts.messageCount > opts.recentWindow || opts.estimatedTokens > threshold;
}

/**
 * Stable hash of everything the context-selection LLM call reads: the sorted
 * file-path list, the summary, and the message history it is handed. Identical
 * inputs → identical key → the previous selection can be reused verbatim.
 */
export function computeSelectionCacheKey(input: {
  filePaths: string[];
  messages: Array<{ id?: string; role?: string; content?: unknown; parts?: unknown; annotations?: unknown }>;
  summary?: string;
}): string {
  const paths = [...input.filePaths].sort().join('\n');

  const msgCanon = input.messages
    .map((message) =>
      JSON.stringify({
        id: message.id,
        role: message.role,
        content: message.content,
        parts: message.parts,
        annotations: message.annotations,
      }),
    )
    .join('\n');

  const canonical = `PATHS\n${paths}\nSUMMARY\n${input.summary ?? ''}\nMSGS\n${msgCanon}`;

  return createHash('sha256').update(canonical).digest('hex');
}

/*
 * Per-conversation LRU of the last context selection. In-process only: on a
 * cold/rotated api pod the map is empty and every turn recomputes (identical to
 * today), so this is a pure fast-path with no correctness dependency on it.
 */
const selectionCache = new Map<string, { key: string; filteredFiles: FileMap }>();

/**
 * Returns the previously-selected FileMap for `chatId` iff the selection inputs
 * (as captured by `key`) are byte-for-byte unchanged; otherwise undefined.
 */
export function getMemoizedSelection(chatId: string, key: string): FileMap | undefined {
  const entry = selectionCache.get(chatId);

  if (entry && entry.key === key) {
    // Refresh LRU recency.
    selectionCache.delete(chatId);
    selectionCache.set(chatId, entry);

    return entry.filteredFiles;
  }

  return undefined;
}

/** Record the selection for `chatId`, evicting the least-recently-used entries. */
export function setMemoizedSelection(chatId: string, key: string, filteredFiles: FileMap): void {
  if (selectionCache.has(chatId)) {
    selectionCache.delete(chatId);
  }

  selectionCache.set(chatId, { key, filteredFiles });

  while (selectionCache.size > SELECTION_CACHE_MAX) {
    const oldest = selectionCache.keys().next().value;

    if (oldest === undefined) {
      break;
    }

    selectionCache.delete(oldest);
  }
}

/** Test-only: reset the in-process selection memo. */
export function __clearSelectionCache(): void {
  selectionCache.clear();
}
