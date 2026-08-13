import { createHash } from 'node:crypto';

export type ProjectFileEntry = { path?: string; content?: string };

export type PersistedPromptMessage = {
  role?: unknown;
  content?: unknown;
};

export type PersistedPromptChatState = {
  messages?: unknown;
  archivedMessages?: unknown;
  conversations?: unknown;
};

export type PersistedPromptEvidenceSource =
  | 'ide-state-message'
  | 'ide-state-archived-message'
  | 'ide-state-conversation-message';

export type PersistedPromptEvidence = {
  source: PersistedPromptEvidenceSource;
  candidateLength: number;
  expectedLength: number;
};

export type ProjectFileStabilityState = {
  /** Latest successfully observed persisted-file revision. */
  revision?: string;

  /** Elapsed time covered by uninterrupted, unchanged observations. */
  stableForMs: number;

  /** Number of successful reads after the first read of this revision. */
  unchangedReads: number;

  /** Wall-clock timestamp of the latest successful read. */
  lastObservedAtMs?: number;
};

export const EMPTY_PROJECT_FILE_STABILITY: ProjectFileStabilityState = {
  stableForMs: 0,
  unchangedReads: 0,
};

/**
 * Fold one persisted-file observation into a conservative stability window.
 *
 * Missing revisions, file changes, a regressing clock, or an unexpectedly long
 * observation gap reset the proof window. This is deliberately independent of
 * chat/agent completion annotations: `/api/chat` can persist those annotations
 * before the final multi-agent lane has finished writing files.
 */
export function observeProjectFileRevision(
  previous: Readonly<ProjectFileStabilityState>,
  revision: string | undefined,
  observedAtMs: number,
  maximumObservationGapMs: number,
): ProjectFileStabilityState {
  if (
    !revision ||
    !Number.isFinite(observedAtMs) ||
    !Number.isFinite(maximumObservationGapMs) ||
    maximumObservationGapMs <= 0
  ) {
    return { ...EMPTY_PROJECT_FILE_STABILITY };
  }

  const elapsedMs = previous.lastObservedAtMs === undefined ? undefined : observedAtMs - previous.lastObservedAtMs;

  const continuousObservation =
    previous.revision === revision && elapsedMs !== undefined && elapsedMs >= 0 && elapsedMs <= maximumObservationGapMs;

  if (!continuousObservation) {
    return {
      revision,
      stableForMs: 0,
      unchangedReads: 0,
      lastObservedAtMs: observedAtMs,
    };
  }

  return {
    revision,
    stableForMs: previous.stableForMs + elapsedMs,
    unchangedReads: previous.unchangedReads + 1,
    lastObservedAtMs: observedAtMs,
  };
}

/** Require both elapsed quiet time and repeated API observations. */
export function projectFilesAreStable(
  state: Readonly<ProjectFileStabilityState>,
  minimumStableForMs: number,
  minimumUnchangedReads: number,
) {
  return (
    Boolean(state.revision) && state.stableForMs >= minimumStableForMs && state.unchangedReads >= minimumUnchangedReads
  );
}

/** Normalize UI text before comparing a submitted prompt with its user bubble. */
export function normalizeCaptureProofText(value: string) {
  return value.replace(/\s+/gu, ' ').trim();
}

function persistedMessageText(content: unknown): string | undefined {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return undefined;
  }

  const text = content
    .flatMap((part) => {
      if (!part || typeof part !== 'object' || !('text' in part) || typeof part.text !== 'string') {
        return [];
      }

      return [part.text];
    })
    .join('\n');

  return text || undefined;
}

/**
 * Match a complete submitted prompt, never a short identifying fragment.
 *
 * Project creation prepends its known production contract before persisting
 * the user's submission. Accept only the exact prompt, or that exact prompt
 * after the contract's `User prompt:` boundary. An arbitrary prefix ending in
 * the same words is not provenance.
 */
function persistedValueContainsCompletePrompt(candidate: unknown, expectedPrompt: string) {
  const text = persistedMessageText(candidate);
  const expected = normalizeCaptureProofText(expectedPrompt);

  if (!text || !expected) {
    return undefined;
  }

  const normalizedCandidate = normalizeCaptureProofText(text);

  if (normalizedCandidate === expected) {
    return { candidateLength: normalizedCandidate.length, expectedLength: expected.length };
  }

  const marker = 'User prompt:';
  const markerOffset = normalizedCandidate.lastIndexOf(marker);

  if (markerOffset < 0) {
    return undefined;
  }

  const knownContract = normalizedCandidate.slice(0, markerOffset);
  const wrappedPrompt = normalizedCandidate.slice(markerOffset + marker.length).trim();

  return /^(?:\[Language: [^\]]+\]\s*)?Artifact type:\s*\S+/i.test(knownContract) &&
    /Preferred framework:/i.test(knownContract) &&
    /Production quality bar:/i.test(knownContract) &&
    wrappedPrompt === expected
    ? { candidateLength: normalizedCandidate.length, expectedLength: expected.length }
    : undefined;
}

function asPromptMessages(value: unknown): PersistedPromptMessage[] {
  return Array.isArray(value)
    ? value.filter((message): message is PersistedPromptMessage => Boolean(message) && typeof message === 'object')
    : [];
}

/** Find the exact user submission in an authenticated persisted IDE state. */
export function findPersistedPromptEvidence(
  chat: PersistedPromptChatState | undefined,
  expectedPrompt: string,
): PersistedPromptEvidence | undefined {
  if (!chat) {
    return undefined;
  }

  const messagePools: Array<{
    source: PersistedPromptEvidenceSource;
    messages: PersistedPromptMessage[];
  }> = [
    { source: 'ide-state-message', messages: asPromptMessages(chat.messages) },
    { source: 'ide-state-archived-message', messages: asPromptMessages(chat.archivedMessages) },
  ];

  if (Array.isArray(chat.conversations)) {
    messagePools.push({
      source: 'ide-state-conversation-message',
      messages: chat.conversations.flatMap((conversation) => {
        if (!conversation || typeof conversation !== 'object' || !('messages' in conversation)) {
          return [];
        }

        return asPromptMessages(conversation.messages);
      }),
    });
  }

  for (const { source, messages } of messagePools) {
    for (const message of messages) {
      if (message.role !== 'user') {
        continue;
      }

      const match = persistedValueContainsCompletePrompt(message.content, expectedPrompt);

      if (match) {
        return { source, ...match };
      }
    }
  }

  return undefined;
}

/** Hash only persisted project files, independent of chat/progress metadata. */
export function projectFilesRevisionFromEntries(entries: readonly ProjectFileEntry[]) {
  if (entries.length === 0) {
    return undefined;
  }

  const files = [...entries]
    .sort((left, right) => (left.path ?? '').localeCompare(right.path ?? ''))
    .map((file) => ({ path: file.path ?? '', content: file.content ?? '' }));

  return createHash('sha256').update(JSON.stringify(files)).digest('hex');
}
