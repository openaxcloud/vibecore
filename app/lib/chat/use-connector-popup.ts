import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * Shared hook for launching a connector OAuth popup and reacting to the
 * postMessage emitted by /integrations/oauth/:provider/callback. Used by
 * the Git provider panels, the Settings → GitHub tab button, and the chat
 * connection_request card.
 *
 * The hook does not assume a specific endpoint; the caller passes
 * launchUrl when ready (typically after a POST to
 * /api/integrations/oauth/:provider/connect). The hook owns:
 *   - state machine (idle | launching | succeeded | failed)
 *   - postMessage listener scoped to window.location.origin
 *   - manual-close detection (poll popup.closed every 500ms)
 *   - the resolved outcome payload (provider, userConnectionId,
 *     accountLabel, scopes) or the failure reason
 *
 * postMessage events that do not match the expected provider are
 * ignored so two concurrent popups for different providers cannot
 * cross-talk.
 */

export type ConnectorPopupResult =
  | {
      ok: true;
      provider: string;
      userConnectionId: string;
      accountLabel: string;
      scopes?: string[];
    }
  | {
      ok: false;
      provider: string;
      errorCode?: string;
      errorMessage?: string;
    };

export type ConnectorPopupState =
  | { phase: 'idle' }
  | { phase: 'launching' }
  | { phase: 'succeeded'; result: Extract<ConnectorPopupResult, { ok: true }> }
  | { phase: 'failed'; result: Extract<ConnectorPopupResult, { ok: false }> };

export interface ConnectorPopupHook {
  state: ConnectorPopupState;
  launch: (input: { authorizationUrl: string; provider: string }) => void;
  reset: () => void;
}

function isConnectorMessage(value: unknown): value is {
  type: string;
  provider: string;
  userConnectionId?: string;
  accountLabel?: string;
  scopes?: string[];
  errorCode?: string;
  errorMessage?: string;
} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as { type?: unknown; provider?: unknown };

  return (
    (candidate.type === 'e-code.connector.connection.resolved' ||
      candidate.type === 'e-code.connector.connection.failed') &&
    typeof candidate.provider === 'string'
  );
}

/*
 * Decide whether a given postMessage should be handled by a useConnectorPopup
 * instance. Returns true only when:
 *   - the message is a well-formed connector message, AND
 *   - this instance actually launched a popup (expectedProvider is non-null), AND
 *   - the message provider matches the provider this instance launched for.
 *
 * An idle instance (expectedProvider === null) must never react: several hook
 * instances are mounted per assistant turn (one card per annotation), and only
 * the one that called launch() should consume the OAuth completion message.
 */
export function shouldHandleConnectorMessage(data: unknown, expectedProvider: string | null): boolean {
  if (!isConnectorMessage(data)) {
    return false;
  }

  if (!expectedProvider) {
    return false;
  }

  return data.provider === expectedProvider;
}

export function useConnectorPopup(): ConnectorPopupHook {
  const [state, setState] = useState<ConnectorPopupState>({ phase: 'idle' });
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<number | null>(null);
  const expectedProviderRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }

    popupRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) {
        return;
      }

      /*
       * Only an instance that actually launched a popup should react to a
       * connector postMessage. expectedProviderRef starts null and is set
       * inside launch(); an idle instance (null ref) must ignore the event so
       * it cannot cross-talk with another card's OAuth completion.
       */
      if (!shouldHandleConnectorMessage(event.data, expectedProviderRef.current)) {
        return;
      }

      if (!isConnectorMessage(event.data)) {
        /*
         * Unreachable once shouldHandleConnectorMessage returns true, but
         * narrows event.data to the connector message shape for TypeScript.
         */
        return;
      }

      cleanup();

      if (event.data.type === 'e-code.connector.connection.resolved') {
        if (!event.data.userConnectionId || !event.data.accountLabel) {
          setState({
            phase: 'failed',
            result: {
              ok: false,
              provider: event.data.provider,
              errorCode: 'CALLBACK_PAYLOAD_INCOMPLETE',
              errorMessage: 'The callback page did not return a userConnectionId or accountLabel.',
            },
          });

          return;
        }

        setState({
          phase: 'succeeded',
          result: {
            ok: true,
            provider: event.data.provider,
            userConnectionId: event.data.userConnectionId,
            accountLabel: event.data.accountLabel,
            scopes: event.data.scopes,
          },
        });
      } else {
        setState({
          phase: 'failed',
          result: {
            ok: false,
            provider: event.data.provider,
            errorCode: event.data.errorCode,
            errorMessage: event.data.errorMessage,
          },
        });
      }
    }

    window.addEventListener('message', handleMessage);

    return () => window.removeEventListener('message', handleMessage);
  }, [cleanup]);

  const launch = useCallback(
    (input: { authorizationUrl: string; provider: string }) => {
      cleanup();
      expectedProviderRef.current = input.provider;
      setState({ phase: 'launching' });

      const popup = window.open(
        input.authorizationUrl,
        `e-code-${input.provider}-oauth`,
        'width=720,height=820,resizable=yes,scrollbars=yes',
      );

      if (!popup) {
        setState({
          phase: 'failed',
          result: {
            ok: false,
            provider: input.provider,
            errorCode: 'POPUP_BLOCKED',
            errorMessage: 'Popup was blocked. Allow popups for this site and try again.',
          },
        });

        return;
      }

      popupRef.current = popup;
      pollRef.current = window.setInterval(() => {
        if (popupRef.current?.closed) {
          cleanup();
          setState((current) => {
            if (current.phase === 'launching') {
              return {
                phase: 'failed',
                result: {
                  ok: false,
                  provider: input.provider,
                  errorCode: 'POPUP_CLOSED',
                  errorMessage: 'You closed the popup before completing the connection.',
                },
              };
            }

            return current;
          });
        }
      }, 500);
    },
    [cleanup],
  );

  const reset = useCallback(() => {
    cleanup();
    expectedProviderRef.current = null;
    setState({ phase: 'idle' });
  }, [cleanup]);

  return { state, launch, reset };
}
