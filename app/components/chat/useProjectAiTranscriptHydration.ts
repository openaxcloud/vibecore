import type { Message } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { planTranscriptHydrationRetry } from './projectAiTranscript';

export interface ProjectAiTranscriptHydrationOptions {
  /** Project-IDE mode only; the standalone chat hydrates from IndexedDB instead. */
  enabled: boolean;
  projectId: string | undefined;

  /** True when a transcript is already on screen (local history or live messages). */
  hasMessages: boolean;

  /**
   * L'identifiant de conversation sous forme de VALEUR réactive.
   *
   * `resolveConversationId` reste l'autorité pour la résolution : il lit une
   * `ref`, renseignée sans re-rendu quand une conversation est créée en cours de
   * session. Mais une `ref` et une lecture de store non souscrite ne déclenchent
   * rien. Quand l'identifiant arrivait APRÈS le premier rendu, l'effet avait
   * déjà renoncé et plus rien ne le relançait : la conversation restait vide
   * pour toute la durée de la page, alors que le serveur avait bien répondu.
   *
   * Ce champ ne sert qu'à faire re-jouer l'effet à ce moment-là.
   */
  conversationId: string | undefined;

  /** Read at effect time — the conversation id is discovered asynchronously. */
  resolveConversationId: () => string | undefined;

  loadTranscript: (projectId: string, conversationId: string) => Promise<Message[]>;

  /** Push the loaded transcript into chat state. */
  applyTranscript: (messages: Message[]) => void | Promise<void>;

  onLoadError: (error: unknown) => void;

  /** Called once the bounded auto-retries are exhausted; `retry` restarts them. */
  onRetriesExhausted: (retry: () => void) => void;
}

/**
 * Loads a returning project's agent transcript from the backend exactly once per
 * mount, with bounded auto-retry for a cold/GC'd workspace.
 *
 * The subtle part is abandonment. An earlier revision closed over a per-run
 * `cancelled` flag flipped by the effect's cleanup, and latched "already
 * hydrated" the moment the request went out. React runs that cleanup on every
 * re-run, not just on unmount — and one of the consumer's dependencies
 * (`storeMessageHistory`) changed identity on every render. So the effect
 * re-ran while the request was in flight, the cleanup marked the response
 * cancelled, the response was dropped, and the latch stopped anything from ever
 * fetching it again: a returning user got a permanently empty agent panel while
 * the network tab showed the full transcript arriving with 200 OK.
 *
 * Two changes keep that from recurring: the effect depends only on values that
 * actually change what to load (consumer callbacks are read through a ref), and
 * abandonment is scoped to unmount rather than to any cleanup, so a re-run can
 * never discard a response the latch will not re-request.
 */
export function useProjectAiTranscriptHydration(options: ProjectAiTranscriptHydrationOptions): void {
  const { enabled, projectId, hasMessages, conversationId } = options;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const hydratedRef = useRef(false);
  const retryAttemptRef = useRef(0);
  const unmountedRef = useRef(false);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    unmountedRef.current = false;

    return () => {
      unmountedRef.current = true;
    };
  }, []);

  const restartRetries = useCallback(() => {
    retryAttemptRef.current = 0;
    setRetryNonce((nonce) => nonce + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !projectId || hydratedRef.current || hasMessages) {
      return undefined;
    }

    const conversationId = optionsRef.current.resolveConversationId();

    if (!conversationId) {
      return undefined;
    }

    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    hydratedRef.current = true;

    const hydrate = async () => {
      const messages = await optionsRef.current.loadTranscript(projectId, conversationId);

      if (unmountedRef.current || messages.length === 0) {
        return;
      }

      retryAttemptRef.current = 0;
      await optionsRef.current.applyTranscript(messages);
    };

    void hydrate().catch((error) => {
      if (unmountedRef.current) {
        return;
      }

      /*
       * Release the latch so the conversation can be hydrated again on the next
       * effect run. A returning user with a real (but transiently unreachable)
       * transcript must never be left with a silently-empty chat panel.
       */
      hydratedRef.current = false;
      optionsRef.current.onLoadError(error);

      const attempt = retryAttemptRef.current;
      const { shouldRetry, delayMs } = planTranscriptHydrationRetry(attempt);

      if (shouldRetry) {
        retryAttemptRef.current = attempt + 1;
        retryTimer = setTimeout(() => {
          if (!unmountedRef.current) {
            setRetryNonce((nonce) => nonce + 1);
          }
        }, delayMs);

        return;
      }

      optionsRef.current.onRetriesExhausted(restartRetries);
    });

    return () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };

    /*
     * `conversationId` est ici pour une seule raison : relancer l'effet quand
     * l'identifiant arrive tardivement. Mesuré sur main — l'effet partait une
     * fois avec « aucun identifiant », sortait, et n'était jamais rejoué :
     * 3 chargements sur 10 affichaient une conversation vide alors que le
     * serveur avait bien renvoyé ses 6 messages.
     */
  }, [conversationId, enabled, hasMessages, projectId, restartRetries, retryNonce]);
}
