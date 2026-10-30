import type { Message } from 'ai';
import { useEffect, useRef, type MutableRefObject } from 'react';
import { effacerLeTourEnCours } from '~/lib/chat/tour-en-cours';
import type { ProjectIdeMemory } from '~/lib/persistence/projectIdeMemory';
import { resolvePendingPrompt } from '~/lib/runtime/pending-generation';
import { latestStreamTerminal } from '~/lib/runtime/stream-terminal';

export interface PendingChatGeneration {
  promptId: string;
  pendingPrompt: NonNullable<NonNullable<ProjectIdeMemory['chat']>['pendingPrompt']>;
  baselineFileCount: number;
}

interface Options {
  projectId?: string;
  generation: () => number;
  pendingGeneration: MutableRefObject<PendingChatGeneration | null>;
  countFiles: () => number;
  consume: (projectId: string, generation: PendingChatGeneration) => void;
}

/** Recovery bookkeeping only; file parsing/finalization remains in the sampled transcript effect. */
export function useChatTerminalRecovery(options: Options) {
  const latest = useRef(options);
  latest.current = options;

  const turn = useRef<{ projectId?: string; generation: number; epoch: number }>();
  const epoch = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const invalidate = () => {
    epoch.current += 1;
    turn.current = undefined;
    clearTimeout(timer.current);
  };

  useEffect(() => invalidate, [options.projectId]);

  // The SDK captures this render's callbacks per request. Never borrow a later request's token.
  let issuedTurn: typeof turn.current;
  let dispatched = false;

  const ownsCurrentTurn = () =>
    issuedTurn !== undefined &&
    issuedTurn === turn.current &&
    issuedTurn.projectId === latest.current.projectId &&
    issuedTurn.generation === latest.current.generation();

  return {
    begin() {
      invalidate();

      // Two requests from the same render have indistinguishable callbacks: keep recovery conservatively.
      if (dispatched) {
        issuedTurn = undefined;
        return;
      }

      dispatched = true;
      issuedTurn = { projectId: options.projectId, generation: options.generation(), epoch: epoch.current };
      turn.current = issuedTurn;
    },
    cancel() {
      invalidate();
      options.pendingGeneration.current = null;
    },
    fail() {
      if (!ownsCurrentTurn()) {
        return false;
      }

      invalidate();
      options.pendingGeneration.current = null;

      return true;
    },
    finish(message: Message, finishReason: string | undefined): 'complete' | 'incomplete' | undefined {
      const active = turn.current;
      const current = latest.current;

      if (!active || !ownsCurrentTurn()) {
        return undefined;
      }

      turn.current = undefined;

      const terminal = latestStreamTerminal(message.annotations, message.id);
      const complete = finishReason === 'stop' && terminal?.status === 'complete';

      if (complete && active.projectId) {
        effacerLeTourEnCours(active.projectId);
      }

      const pending = current.pendingGeneration.current;

      if (!complete) {
        current.pendingGeneration.current = null;
      }

      if (complete && pending && active.projectId) {
        const projectId = active.projectId;
        timer.current = setTimeout(() => {
          if (
            epoch.current !== active.epoch ||
            latest.current.projectId !== projectId ||
            latest.current.generation() !== active.generation ||
            current.pendingGeneration.current !== pending
          ) {
            return;
          }

          current.pendingGeneration.current = null;

          if (
            resolvePendingPrompt({
              baselineFileCount: pending.baselineFileCount,
              finalFileCount: current.countFiles(),
              errored: !complete,
            }) === 'clear'
          ) {
            current.consume(projectId, pending);
          }
        }, 1500);
      }

      return complete ? 'complete' : 'incomplete';
    },
  };
}
