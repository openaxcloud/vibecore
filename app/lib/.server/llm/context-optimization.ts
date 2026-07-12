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

/** Bounded number of conversations kept in the summary memo (LRU). */
export const SUMMARY_CACHE_MAX = 200;

/**
 * Step (in messages) by which the ANCHORED history window advances its start.
 *
 * The window keeps a recent slice of the conversation. A naive `slice(-recentWindow)`
 * SLIDES its start by one message every turn, so the first retained message changes
 * each turn and the cross-turn prompt-cache prefix collapses right after the system
 * (measured live: cachedPromptTokens pinned at the system floor, 3968, turn after
 * turn). Advancing the start only in whole steps of this size keeps the first
 * retained message BYTE-IDENTICAL for a full step of growth — a run of cache hits —
 * then jumps one step (a single cold miss). 10 ≈ 5 exchanges of stability per palier.
 */
export const HISTORY_WINDOW_STEP = 10;

/**
 * Anchored / append-only history window: the number of leading messages to DROP so
 * the retained window's START stays fixed within a palier.
 *
 * `total ≤ recentWindow` → drop 0 (the whole history fits, start already stable at
 * 0). Otherwise the raw drop (`total - recentWindow`) is quantized DOWN to a multiple
 * of `step`, so `messages[drop]` (the first retained message) is invariant while
 * `total` grows through a step, then advances by exactly one step. The retained count
 * is therefore bounded in `[recentWindow, recentWindow + step - 1]` — the built-in
 * budget guardrail: the window can never grow past a palier before it jumps. `step ≤
 * 1` degenerates to the old sliding window (drop every surplus message).
 *
 * Pure + deterministic: same inputs → same drop, in every process, so the summary
 * palier (api.chat) and the window slice (stream-text) agree without shared state.
 */
export function anchoredHistoryDrop(total: number, recentWindow: number, step: number = HISTORY_WINDOW_STEP): number {
  if (!(recentWindow > 0) || total <= recentWindow) {
    return 0;
  }

  const rawDrop = total - recentWindow;

  if (!(step > 1)) {
    return rawDrop;
  }

  return Math.floor(rawDrop / step) * step;
}

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

/**
 * Palier key for the CHAT SUMMARY: a stable hash of the messages the anchored
 * window DROPS (`messages[0..drop)`). Within a palier the window start is fixed, so
 * the dropped prefix — and therefore this key — is byte-stable; the summary is
 * regenerated ONLY when the window jumps a step (or the history is edited). Keyed on
 * the dropped prefix rather than the drop COUNT so an edit to an older message still
 * invalidates the cached summary.
 */
export function computeSummaryCacheKey(input: {
  droppedMessages: Array<{ id?: string; role?: string; content?: unknown; parts?: unknown }>;
}): string {
  const canon = input.droppedMessages
    .map((message) =>
      JSON.stringify({ id: message.id, role: message.role, content: message.content, parts: message.parts }),
    )
    .join('\n');

  return createHash('sha256').update(`DROPPED\n${canon}`).digest('hex');
}

/*
 * Per-conversation LRU of the last chat summary, keyed by the anchored-window
 * palier. In-process only (mirrors the selection memo): a cold pod recomputes, so a
 * miss is never a regression. Reusing within a palier only ever serves a summary of
 * the SAME dropped prefix — the newer messages are carried verbatim in the window —
 * so there is no information loss, just one fewer LLM call per turn within a palier.
 */
const summaryCache = new Map<string, { key: string; summary: string }>();

/** Returns the previously-generated summary for `chatId` iff the palier key is unchanged. */
export function getMemoizedSummary(chatId: string, key: string): string | undefined {
  const entry = summaryCache.get(chatId);

  if (entry && entry.key === key) {
    // Refresh LRU recency.
    summaryCache.delete(chatId);
    summaryCache.set(chatId, entry);

    return entry.summary;
  }

  return undefined;
}

/** Record the summary for `chatId`, evicting the least-recently-used entries. */
export function setMemoizedSummary(chatId: string, key: string, summary: string): void {
  if (summaryCache.has(chatId)) {
    summaryCache.delete(chatId);
  }

  summaryCache.set(chatId, { key, summary });

  while (summaryCache.size > SUMMARY_CACHE_MAX) {
    const oldest = summaryCache.keys().next().value;

    if (oldest === undefined) {
      break;
    }

    summaryCache.delete(oldest);
  }
}

/** Test-only: reset the in-process summary memo. */
export function __clearSummaryCache(): void {
  summaryCache.clear();
}
