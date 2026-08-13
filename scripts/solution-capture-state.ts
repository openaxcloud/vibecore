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

export type CompleteSubmittedPromptMatchForm = 'exact' | 'server-project-contract';

export type CompleteSubmittedPromptMatch = {
  candidateLength: number;
  expectedLength: number;
  matchForm: CompleteSubmittedPromptMatchForm;
  normalizedCandidate: string;
  normalizedPrompt: string;
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
export const SERVER_PROJECT_WEB_CONTRACT = normalizeCaptureProofText(
  [
    'Artifact type: Web',
    'Preferred framework: React + Vite + TypeScript',
    'Build this as a production React/Vite web application with TypeScript, modular components, realistic data, routing-ready structure, and a live preview that starts with npm run dev.',
    '',
    'Production quality bar:',
    '- ZERO placeholder code: no TODO-only paths, dead buttons, hollow panels, inert tabs, or implement-later placeholders.',
    '- Every generated feature must work immediately in preview; if preview would be blank, change the implementation before finishing.',
    '- Use TypeScript everywhere with strict, explicit types for components, data models, API payloads, and adapters.',
    '- For app requests, build full-stack by default: frontend, backend/API boundary, persistence or typed local adapter, auth/session model when relevant, styling, tests, and deployment config where feasible.',
    '- Single-command runnability: the app MUST render a browsable UI in preview with ONE `npm run dev` from ONE root package.json (which MUST have a `dev` script) on a single port bound to 0.0.0.0. Do not split into separate client/server packages that each need their own process — serve any backend from the same dev server (Vite middleware/plugin, framework API routes, or one concurrent `dev` script). A backend-only server with no browsable UI on the dev port is a blank-preview failure.',
    '- Dark mode must be the default, with a working light mode toggle when the app exposes theming.',
    '- Build mobile-first responsive layouts that work on phones, tablets, and desktop without overlapping text or unstable dimensions.',
    '- Add skeletons or explicit loading states for every async operation.',
    '- Add error boundaries or recoverable error states around every panel and async surface.',
    '- Any WebSocket or realtime client must auto-reconnect with exponential backoff and clean up timers/listeners.',
    '- Include realistic data, meaningful copy, complete empty/loading/error/success/disabled states, and at least one complete primary workflow.',
    '- Validate user input, avoid secret leaks, and keep client config safe.',
    '- Never report successful external-service behavior unless a real typed local/offline adapter is executing or a clear integration-required state is shown.',
    '- Run or define relevant tests and verification paths; do not present broken code as finished.',
    '- Build a complete, previewable app, not a landing placeholder or static mockup.',
    '- Target Fortune 500 / enterprise polish: credible information architecture, restrained premium visual design, precise spacing, professional typography, and real workflow density.',
    '- Include realistic domain data, meaningful copy, charts/tables/cards where relevant, and visible states for loading, empty, error, success, and disabled controls.',
    '- Every visible button, tab, filter, menu, toggle, form control, and navigation item must have real client-side behavior using React state; no decorative dead controls.',
    '- Include at least one complete primary workflow with input, validation, optimistic/success feedback, error handling, empty state recovery, and disabled/submitting states.',
    '- For dashboards and SaaS products, build an operational product UI with dense but readable information architecture, not a marketing landing page.',
    '- Make the first screen immediately useful inside the Preview tab with no blank splash, no external setup, and no hidden critical interaction.',
    '- Use React + Vite + TypeScript for web-style artifacts unless the selected artifact explicitly requires another framework.',
    '- Split React code into purposeful components, typed local fixtures, derived metrics, and handlers; avoid a single static JSX mockup.',
    '- Always create a runnable package.json with dev, build, and preview scripts; include index.html, src/main.tsx, and Vite config when using React/Vite.',
    '- Keep runtime dependencies lean and browser-compatible; avoid native binaries, heavy assets, unnecessary frameworks, and API calls that can fail in preview.',
    '- Optimize for performance: memoize expensive derived data, avoid layout thrash, use CSS transforms for motion, lazy-load heavy views when useful, and respect prefers-reduced-motion.',
    '- Build responsive layouts for desktop, tablet, and mobile with stable dimensions so content does not jump or overlap.',
    '- Meet WCAG AA basics: semantic HTML, labels, keyboard focus states, ARIA where needed, contrast, and touch targets.',
    '- Before finishing, self-audit the generated files: there must be no visible dead buttons, no inert tabs, no nonfunctional forms, and no placeholder-only panels.',
    '- Finish with a start action so the live preview can attach automatically.',
  ].join('\n'),
);

function isServerProjectContract(value: string) {
  const languagePrefix = value.match(/^\[Language: [^\]\r\n]+\]\s+/u)?.[0] ?? '';

  return value.slice(languagePrefix.length) === SERVER_PROJECT_WEB_CONTRACT;
}

/**
 * Match a submitted prompt in either publishable form produced by E-Code.
 *
 * A normal Agent send is the exact prompt. `/projects/new` deliberately wraps
 * the same prompt in its server-owned generation contract. That second form is
 * accepted only when all stable contract anchors occur in order and the text
 * after the final `User prompt:` boundary is the complete expected prompt.
 */
export function matchCompleteSubmittedPrompt(
  candidate: unknown,
  expectedPrompt: string,
): CompleteSubmittedPromptMatch | undefined {
  const text = persistedMessageText(candidate);
  const expected = normalizeCaptureProofText(expectedPrompt);

  if (!text || !expected) {
    return undefined;
  }

  const normalizedCandidate = normalizeCaptureProofText(text);

  if (normalizedCandidate === expected) {
    return {
      candidateLength: normalizedCandidate.length,
      expectedLength: expected.length,
      matchForm: 'exact',
      normalizedCandidate,
      normalizedPrompt: expected,
    };
  }

  const marker = 'User prompt:';
  const markerOffset = normalizedCandidate.lastIndexOf(marker);

  if (markerOffset < 0) {
    return undefined;
  }

  const knownContract = normalizedCandidate.slice(0, markerOffset).trim();
  const wrappedPrompt = normalizedCandidate.slice(markerOffset + marker.length).trim();

  if (!isServerProjectContract(knownContract) || wrappedPrompt !== expected) {
    return undefined;
  }

  return {
    candidateLength: normalizedCandidate.length,
    expectedLength: expected.length,
    matchForm: 'server-project-contract',
    normalizedCandidate,
    normalizedPrompt: expected,
  };
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

      const match = matchCompleteSubmittedPrompt(message.content, expectedPrompt);

      if (match) {
        return {
          source,
          candidateLength: match.candidateLength,
          expectedLength: match.expectedLength,
        };
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
