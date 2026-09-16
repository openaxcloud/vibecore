/**
 * BUG-SELFREPAIR-RUNAWAY-LOOP-001 — bounded admission control for the AI
 * patch-proposal / silent auto-apply pipeline.
 *
 * Live incident (24/08, prod, mobile): after a small React/Vite counter app
 * generated ("Start application — Done"), the Webview logs filled with
 * HUNDREDS of "AI patch accepted: <file>" lines — `src/styles/global.css`
 * re-accepted ~90 times in a row, then README.md, Counter.tsx,
 * Counter.test.tsx — for over 2.5 minutes, while the dev server never bound
 * 5173 (`preview.proxy.unreachable`) and the iframe stayed on about:blank.
 *
 * Mechanism: the generator re-emits file actions with FRESH actionIds for
 * identical content (measured before as BUG-AGENT-001: package.json written
 * 96×, one distinct size). The direct-write path got a (path, content)
 * fingerprint dedupe in ActionRunner#runFileAction, but the REVIEW path never
 * did: every re-emitted action creates a NEW pending proposal
 * (`${artifactId}:${actionId}`), the silent auto-apply accepts each one
 * (~1-2 s per accept: mutex + validation + write + full file reload +
 * checkpoint), and each accept logs "AI patch accepted". 90 duplicates queued
 * during streaming drain for minutes after "Done". Meanwhile `_runAction`
 * skips every follow-up command — including `start` — while ANY proposal for
 * the artifact is open ("AI command skipped until reviewed file changes are
 * accepted or rejected"), so `npm run dev` is starved and the preview never
 * comes up.
 *
 * This guard is the single admission point for that pipeline. It is pure and
 * deterministic (time injected) so the bounds are unit-testable with real
 * numbers.
 *
 * Decisions:
 *  - 'skip-identical'  — the content is byte-identical (fingerprint) to what
 *    was already queued or accepted for this path: no new proposal, no accept,
 *    no log line. Kills the ×90 duplicate storm outright.
 *  - 'apply'           — admitted, with an exponential per-file backoff delay
 *    once a file has been patched repeatedly inside the window.
 *  - 'halt'            — a bound was hit; the caller must stop cleanly and
 *    escalate (clear alert + log) instead of looping.
 *
 * Bounds (per sliding window):
 *  - per-file DISTINCT-content applies: a legitimate generation touches a file
 *    a handful of times; dozens of distinct patches to one file inside minutes
 *    is a non-converging repair loop.
 *  - global applies: a generous backstop so a large multi-file generation
 *    passes while an unbounded cross-file loop cannot.
 *  - consecutive per-file apply FAILURES: a patch that keeps failing to apply
 *    is not converging; stop re-trying it.
 *
 * Identical re-emissions are skipped SILENTLY and never count toward the
 * bounds: healthy generations also re-emit identical actions in bulk, so
 * escalating on duplicates would be a false alarm.
 */

export interface AgentPatchFloodGuardOptions {
  /** Sliding window over which the counters live. */
  windowMs: number;

  /** Max DISTINCT-content applies per file inside the window. */
  perFileMaxApplies: number;

  /** Max applies across all files inside the window (backstop). */
  globalMaxApplies: number;

  /** Consecutive apply failures on one file before halting that file. */
  maxConsecutiveFailures: number;

  /** Backoff starts from this many applies on the same file in the window. */
  backoffAfterApplies: number;

  /** Base backoff delay, doubled per additional apply, capped at backoffMaxMs. */
  backoffBaseMs: number;
  backoffMaxMs: number;
}

export const AGENT_PATCH_FLOOD_DEFAULTS: AgentPatchFloodGuardOptions = {
  windowMs: 10 * 60 * 1000,
  perFileMaxApplies: 6,
  globalMaxApplies: 120,
  maxConsecutiveFailures: 3,
  backoffAfterApplies: 3,
  backoffBaseMs: 500,
  backoffMaxMs: 8000,
};

export type PatchAdmission =
  | { kind: 'apply'; delayMs: number }
  | { kind: 'skip-identical' }
  | {
      kind: 'halt';
      scope: 'file' | 'global';
      reason: 'per-file-limit' | 'global-limit' | 'repeated-failures';
      attempts: number;
      limit: number;
    };

/** Same djb2-xor-length fingerprint the ActionRunner write dedupe uses. */
export function patchContentFingerprint(content: string): number {
  let h = 5381;

  for (let i = 0; i < content.length; i++) {
    h = ((h << 5) + h + content.charCodeAt(i)) | 0;
  }

  return (h ^ content.length) | 0;
}

interface FileState {
  /** Timestamps of admitted (distinct-content) applies inside the window. */
  applies: number[];

  /** Fingerprint last admitted for this path (queued proposal content). */
  lastQueuedFingerprint?: number;

  /** Fingerprint last successfully accepted/written for this path. */
  lastAcceptedFingerprint?: number;

  consecutiveFailures: number;
  duplicateSkips: number;
}

export class AgentPatchFloodGuard {
  #options: AgentPatchFloodGuardOptions;
  #files = new Map<string, FileState>();
  #globalApplies: number[] = [];

  constructor(options: Partial<AgentPatchFloodGuardOptions> = {}) {
    this.#options = { ...AGENT_PATCH_FLOOD_DEFAULTS, ...options };
  }

  #state(path: string): FileState {
    let state = this.#files.get(path);

    if (!state) {
      state = { applies: [], consecutiveFailures: 0, duplicateSkips: 0 };
      this.#files.set(path, state);
    }

    return state;
  }

  #prune(state: FileState, now: number) {
    const cutoff = now - this.#options.windowMs;
    state.applies = state.applies.filter((at) => at > cutoff);
    this.#globalApplies = this.#globalApplies.filter((at) => at > cutoff);
  }

  /**
   * Admission decision for a proposal about to be queued/applied for `path`
   * with `fingerprint` of its full proposed content.
   *
   * An 'apply' admission COUNTS immediately (the caller is committing to an
   * apply attempt); a failed attempt should then be reported via
   * `recordFailure` and a successful one via `recordAccepted`.
   */
  admit(path: string, fingerprint: number, now: number = Date.now()): PatchAdmission {
    const state = this.#state(path);
    this.#prune(state, now);

    /*
     * Byte-identical to what is already queued or already applied: nothing to
     * do, ever. This alone collapses the measured ×90 duplicate storm — and it
     * must stay SILENT (no halt/alert): even otherwise-healthy generations
     * re-emit identical actions in bulk (BUG-AGENT-001 measured 19 identical
     * vite.config.ts re-writes in a run that worked), so escalating on
     * duplicates would be a false alarm.
     */
    if (fingerprint === state.lastQueuedFingerprint || fingerprint === state.lastAcceptedFingerprint) {
      state.duplicateSkips += 1;

      return { kind: 'skip-identical' };
    }

    if (state.consecutiveFailures >= this.#options.maxConsecutiveFailures) {
      return {
        kind: 'halt',
        scope: 'file',
        reason: 'repeated-failures',
        attempts: state.consecutiveFailures,
        limit: this.#options.maxConsecutiveFailures,
      };
    }

    if (state.applies.length >= this.#options.perFileMaxApplies) {
      return {
        kind: 'halt',
        scope: 'file',
        reason: 'per-file-limit',
        attempts: state.applies.length,
        limit: this.#options.perFileMaxApplies,
      };
    }

    if (this.#globalApplies.length >= this.#options.globalMaxApplies) {
      return {
        kind: 'halt',
        scope: 'global',
        reason: 'global-limit',
        attempts: this.#globalApplies.length,
        limit: this.#options.globalMaxApplies,
      };
    }

    state.applies.push(now);
    this.#globalApplies.push(now);
    state.lastQueuedFingerprint = fingerprint;

    const beyond = state.applies.length - this.#options.backoffAfterApplies;

    const delayMs =
      beyond > 0 ? Math.min(this.#options.backoffBaseMs * 2 ** (beyond - 1), this.#options.backoffMaxMs) : 0;

    return { kind: 'apply', delayMs };
  }

  /**
   * Non-counting check for STREAMING proposal updates. A streamed chunk is
   * partial by definition (dozens of chunks per file), so it must never burn
   * the per-file/global apply budget — but a path that is already at a bound
   * must stop updating proposals, and a chunk byte-identical to already
   * queued/accepted content has nothing to contribute.
   */
  probe(path: string, fingerprint: number, now: number = Date.now()): PatchAdmission {
    const state = this.#state(path);
    this.#prune(state, now);

    if (fingerprint === state.lastQueuedFingerprint || fingerprint === state.lastAcceptedFingerprint) {
      return { kind: 'skip-identical' };
    }

    if (state.consecutiveFailures >= this.#options.maxConsecutiveFailures) {
      return {
        kind: 'halt',
        scope: 'file',
        reason: 'repeated-failures',
        attempts: state.consecutiveFailures,
        limit: this.#options.maxConsecutiveFailures,
      };
    }

    if (state.applies.length >= this.#options.perFileMaxApplies) {
      return {
        kind: 'halt',
        scope: 'file',
        reason: 'per-file-limit',
        attempts: state.applies.length,
        limit: this.#options.perFileMaxApplies,
      };
    }

    if (this.#globalApplies.length >= this.#options.globalMaxApplies) {
      return {
        kind: 'halt',
        scope: 'global',
        reason: 'global-limit',
        attempts: this.#globalApplies.length,
        limit: this.#options.globalMaxApplies,
      };
    }

    return { kind: 'apply', delayMs: 0 };
  }

  /** A patch for `path` landed; remember the written bytes' fingerprint. */
  recordAccepted(path: string, fingerprint: number) {
    const state = this.#state(path);
    state.consecutiveFailures = 0;
    state.lastAcceptedFingerprint = fingerprint;
  }

  /** A patch apply for `path` failed (validation / write error). */
  recordFailure(path: string) {
    const state = this.#state(path);
    state.consecutiveFailures += 1;
  }

  /** Sliding-window per-file backoff to await before applying to `path`. */
  backoffDelayMs(path: string, now: number = Date.now()): number {
    const state = this.#files.get(path);

    if (!state) {
      return 0;
    }

    this.#prune(state, now);

    const beyond = state.applies.length - this.#options.backoffAfterApplies;

    return beyond > 0 ? Math.min(this.#options.backoffBaseMs * 2 ** (beyond - 1), this.#options.backoffMaxMs) : 0;
  }

  /** Full reset (project switch / new session). */
  reset() {
    this.#files.clear();
    this.#globalApplies = [];
  }
}
