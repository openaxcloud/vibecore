import { useCallback, useState } from 'react';
import { Button } from '~/components/ui/Button';
import type {
  ConnectionRequestMessage,
  ConnectionRequestScopeDescription,
  ExistingAccountConnection,
} from '~/lib/chat/connector-messages';
import { useConnectorPopup } from '~/lib/chat/use-connector-popup';

/*
 * The only validation between the agent stream and this component (in
 * AssistantMessage / isConnectorDataPart) checks that `payload.kind` is a
 * string — it does NOT guarantee that `scopes` / `existingAccountConnections`
 * are present. A connection_request part that survives chat persistence,
 * import, or a future/edge producer can therefore arrive with these fields
 * undefined. Since there is no error boundary around the message list, a
 * naive `payload.scopes.length` read would throw and blank the entire
 * transcript. These accessors normalize the optional arrays to a safe value.
 */
export function getRequestedScopes(
  payload: Pick<ConnectionRequestMessage, 'scopes'>,
): ConnectionRequestScopeDescription[] {
  return Array.isArray(payload.scopes) ? payload.scopes : [];
}

export function getExistingAccountConnections(
  payload: Pick<ConnectionRequestMessage, 'existingAccountConnections'>,
): ExistingAccountConnection[] {
  return Array.isArray(payload.existingAccountConnections) ? payload.existingAccountConnections : [];
}

/*
 * Inline card rendered inside an assistant message when the agent emits
 * a connection_request data part. Mirrors the visual language of the
 * Replit OAuth consent dialog but lives inline in the chat so the user
 * can keep their place when authorizing.
 *
 * The card has three states:
 *   - idle: shows the provider logo, reason, scope list and a
 *     "Connect" button. If existingAccountConnections are present, an
 *     additional "Use existing connection" row is shown for each.
 *   - launching: popup is open, the button is disabled with a spinner.
 *   - succeeded: green check + account label.
 *   - failed: red error block with the provider's error code/message.
 *
 * The card POSTs to /api/integrations/oauth/:provider/connect, opens
 * the returned authorize URL in a popup, listens for postMessage from
 * the callback page through useConnectorPopup, and then notifies the
 * caller via the optional onResolved / onFailed callbacks.
 */

export interface ConnectionRequestCardProps {
  payload: ConnectionRequestMessage;
  projectId?: string;
  onResolved?: (input: { userConnectionId: string; accountLabel: string }) => void;
  onFailed?: (input: { errorCode?: string; errorMessage?: string }) => void;
}

export function ConnectionRequestCard({ payload, projectId, onResolved, onFailed }: ConnectionRequestCardProps) {
  const { state, launch, reset } = useConnectorPopup();
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [pendingExistingId, setPendingExistingId] = useState<string | null>(null);

  const startOAuth = useCallback(async () => {
    setNetworkError(null);

    try {
      const response = await fetch(`/api/integrations/oauth/${payload.provider}/connect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(projectId ? { projectId } : {}),
      });

      if (!response.ok) {
        const parsed = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
        const message = parsed.error ?? `Failed to start OAuth flow (HTTP ${response.status})`;
        setNetworkError(message);
        onFailed?.({ errorCode: parsed.code, errorMessage: message });

        return;
      }

      const result = (await response.json()) as { provider: string; authorizationUrl: string };
      launch({ authorizationUrl: result.authorizationUrl, provider: result.provider });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown failure starting OAuth flow.';
      setNetworkError(message);
      onFailed?.({ errorMessage: message });
    }
  }, [launch, onFailed, payload.provider, projectId]);

  const linkExisting = useCallback(
    async (userConnectionId: string, accountLabel: string) => {
      if (!projectId) {
        /*
         * Without a project context the link is implicit (UserConnection
         * already exists for the user); just notify the caller so the
         * chat continues.
         */
        onResolved?.({ userConnectionId, accountLabel });

        return;
      }

      setNetworkError(null);
      setPendingExistingId(userConnectionId);

      try {
        const response = await fetch(`/api/projects/${projectId}/integrations/links`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ userConnectionId }),
        });

        if (!response.ok) {
          const parsed = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
          const message = parsed.error ?? `Failed to link the existing connection (HTTP ${response.status})`;
          setNetworkError(message);
          onFailed?.({ errorCode: parsed.code, errorMessage: message });

          return;
        }

        onResolved?.({ userConnectionId, accountLabel });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown failure linking existing connection.';
        setNetworkError(message);
        onFailed?.({ errorMessage: message });
      } finally {
        setPendingExistingId(null);
      }
    },
    [onFailed, onResolved, projectId],
  );

  if (state.phase === 'succeeded') {
    if (onResolved) {
      onResolved({ userConnectionId: state.result.userConnectionId, accountLabel: state.result.accountLabel });
    }

    return (
      <div className="my-2 rounded-lg border border-bolt-elements-borderColor p-4 bg-bolt-elements-background-depth-1">
        <div className="flex items-center gap-3">
          <span className="i-ph:check-circle-fill w-5 h-5 text-bolt-elements-icon-success" />
          <div>
            <p className="text-sm font-medium text-bolt-elements-textPrimary">
              Connected to {payload.providerDisplayName}
            </p>
            <p className="text-xs text-bolt-elements-textSecondary">as {state.result.accountLabel}</p>
          </div>
        </div>
      </div>
    );
  }

  if (state.phase === 'failed') {
    if (onFailed) {
      onFailed({ errorCode: state.result.errorCode, errorMessage: state.result.errorMessage });
    }

    return (
      <div className="my-2 rounded-lg border border-bolt-elements-borderColor p-4 bg-bolt-elements-background-depth-1">
        <div className="flex items-start gap-3">
          <span className="i-ph:x-circle-fill w-5 h-5 text-bolt-elements-icon-error" />
          <div className="flex-1">
            <p className="text-sm font-medium text-bolt-elements-textPrimary">
              {payload.providerDisplayName} connection failed
            </p>
            <p className="text-xs text-bolt-elements-textSecondary mt-1">
              {state.result.errorMessage ?? 'The provider did not complete the connection.'}
            </p>
            {state.result.errorCode ? (
              <p className="text-xs text-bolt-elements-textTertiary mt-1">Code: {state.result.errorCode}</p>
            ) : null}
            <Button
              onClick={() => {
                reset();
                startOAuth();
              }}
              className="mt-3"
            >
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isLaunching = state.phase === 'launching';
  const scopes = getRequestedScopes(payload);
  const existingConnections = getExistingAccountConnections(payload);
  const hasExisting = existingConnections.length > 0;

  return (
    <div className="my-2 rounded-lg border border-bolt-elements-borderColor p-4 bg-bolt-elements-background-depth-1">
      <div className="flex items-start gap-3">
        <img
          src={payload.providerLogoUrl}
          alt={`${payload.providerDisplayName} logo`}
          className="w-8 h-8 rounded"
          onError={(event) => {
            (event.target as HTMLImageElement).style.visibility = 'hidden';
          }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-bolt-elements-textPrimary">Connect {payload.providerDisplayName}</p>
          <p className="text-xs text-bolt-elements-textSecondary mt-1">{payload.reason}</p>

          {scopes.length > 0 ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-bolt-elements-textSecondary">
                Requested permissions ({scopes.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {scopes.map((scope) => (
                  <li key={scope.scope} className="text-xs text-bolt-elements-textSecondary break-words">
                    <span className="font-mono mr-2 break-all">{scope.scope}</span>
                    <span className="text-bolt-elements-textTertiary">
                      {scope.label}
                      {scope.description ? ` — ${scope.description}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {hasExisting ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-bolt-elements-textSecondary">Use an existing connection:</p>
              {existingConnections.map((existing) => (
                <div
                  key={existing.userConnectionId}
                  className="flex items-center justify-between gap-3 rounded border border-bolt-elements-borderColor p-2"
                >
                  <div>
                    <p className="text-xs font-medium text-bolt-elements-textPrimary">{existing.accountLabel}</p>
                    <p className="text-xs text-bolt-elements-textTertiary">
                      {existing.scopesMatch ? 'Scopes match' : 'Different scopes — re-auth may be required'}
                    </p>
                  </div>
                  <Button
                    onClick={() => linkExisting(existing.userConnectionId, existing.accountLabel)}
                    disabled={pendingExistingId === existing.userConnectionId}
                  >
                    {pendingExistingId === existing.userConnectionId ? 'Linking...' : 'Use this'}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-3 flex items-center gap-2">
            <Button onClick={startOAuth} disabled={isLaunching}>
              {isLaunching ? (
                <span className="flex items-center gap-2">
                  <span className="i-ph:spinner-gap-bold animate-spin w-4 h-4" />
                  Waiting for {payload.providerDisplayName}...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="i-ph:plug w-4 h-4" />
                  {hasExisting
                    ? `Connect a new ${payload.providerDisplayName} account`
                    : `Connect ${payload.providerDisplayName}`}
                </span>
              )}
            </Button>
          </div>

          {networkError ? (
            <p role="alert" className="mt-2 text-xs text-bolt-elements-icon-error">
              {networkError}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
