import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/Button';
import type {
  ConnectionRequestMessage,
  ConnectionRequestScopeDescription,
  ExistingAccountConnection,
} from '~/lib/chat/connector-messages';
import { useConnectorPopup } from '~/lib/chat/use-connector-popup';
import {
  formatChatConnectorsCopy,
  formatChatConnectorsPlural,
  getChatConnectorsCopy,
} from '~/lib/i18n/catalogs/chat-connectors';

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
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getChatConnectorsCopy(language);
  const { state, launch, reset } = useConnectorPopup();
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [pendingExistingId, setPendingExistingId] = useState<string | null>(null);
  const notifiedResultRef = useRef<string | null>(null);

  useEffect(() => {
    if (state.phase === 'launching' || state.phase === 'idle') {
      notifiedResultRef.current = null;

      return;
    }

    if (state.phase === 'succeeded') {
      const resultKey = `succeeded:${state.result.userConnectionId}`;

      if (notifiedResultRef.current !== resultKey) {
        notifiedResultRef.current = resultKey;
        onResolved?.({
          userConnectionId: state.result.userConnectionId,
          accountLabel: state.result.accountLabel,
        });
      }

      return;
    }

    const resultKey = `failed:${state.result.errorCode ?? 'unspecified'}`;

    if (notifiedResultRef.current !== resultKey) {
      notifiedResultRef.current = resultKey;
      onFailed?.({
        errorCode: state.result.errorCode,
        errorMessage: copy['chatConnectors.connection.failureDefault'],
      });
    }
  }, [copy, onFailed, onResolved, state]);

  const startOAuth = useCallback(async () => {
    setNetworkError(null);

    try {
      const response = await fetch(`/api/integrations/oauth/${payload.provider}/connect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(projectId ? { projectId } : {}),
      });

      if (!response.ok) {
        const parsed = (await response.json().catch(() => ({}))) as { code?: unknown };
        const errorCode = typeof parsed.code === 'string' ? parsed.code : undefined;
        const message = copy['chatConnectors.connection.startFailed'];
        setNetworkError(message);
        onFailed?.({ errorCode, errorMessage: message });

        return;
      }

      const result = (await response.json()) as { provider?: unknown; authorizationUrl?: unknown };

      if (
        typeof result.authorizationUrl !== 'string' ||
        typeof result.provider !== 'string' ||
        result.provider !== payload.provider
      ) {
        throw new Error(payload.provider);
      }

      launch({ authorizationUrl: result.authorizationUrl, provider: result.provider });
    } catch {
      const message = copy['chatConnectors.connection.startFailed'];
      setNetworkError(message);
      onFailed?.({ errorMessage: message });
    }
  }, [copy, launch, onFailed, payload.provider, projectId]);

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
          const parsed = (await response.json().catch(() => ({}))) as { code?: unknown };
          const errorCode = typeof parsed.code === 'string' ? parsed.code : undefined;
          const message = copy['chatConnectors.connection.linkFailed'];
          setNetworkError(message);
          onFailed?.({ errorCode, errorMessage: message });

          return;
        }

        onResolved?.({ userConnectionId, accountLabel });
      } catch {
        const message = copy['chatConnectors.connection.linkFailed'];
        setNetworkError(message);
        onFailed?.({ errorMessage: message });
      } finally {
        setPendingExistingId(null);
      }
    },
    [copy, onFailed, onResolved, projectId],
  );

  if (state.phase === 'succeeded') {
    return (
      <div className="my-2 rounded-lg border border-bolt-elements-borderColor p-4 bg-bolt-elements-background-depth-1">
        <div className="flex items-center gap-3">
          <span className="i-ph:check-circle-fill h-5 w-5 shrink-0 text-bolt-elements-icon-success" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium text-bolt-elements-textPrimary">
              {formatChatConnectorsCopy(copy['chatConnectors.connection.connectedTo'], {
                provider: payload.providerDisplayName,
              })}
            </p>
            <p className="break-words text-xs text-bolt-elements-textSecondary">
              {formatChatConnectorsCopy(copy['chatConnectors.connection.as'], {
                account: state.result.accountLabel,
              })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (state.phase === 'failed') {
    return (
      <div className="my-2 rounded-lg border border-bolt-elements-borderColor p-4 bg-bolt-elements-background-depth-1">
        <div className="flex items-start gap-3">
          <span className="i-ph:x-circle-fill h-5 w-5 shrink-0 text-bolt-elements-icon-error" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-bolt-elements-textPrimary">
              {formatChatConnectorsCopy(copy['chatConnectors.connection.failed'], {
                provider: payload.providerDisplayName,
              })}
            </p>
            <p className="mt-1 text-xs text-bolt-elements-textSecondary">
              {copy['chatConnectors.connection.failureDefault']}
            </p>
            {state.result.errorCode ? (
              <p className="mt-1 break-all text-xs text-bolt-elements-textTertiary">
                {formatChatConnectorsCopy(copy['chatConnectors.connection.code'], {
                  code: state.result.errorCode,
                })}
              </p>
            ) : null}
            <Button
              onClick={() => {
                reset();
                void startOAuth();
              }}
              className="mt-3 min-h-11 whitespace-normal"
            >
              {copy['chatConnectors.connection.retry']}
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
          alt={formatChatConnectorsCopy(copy['chatConnectors.connection.logoAlt'], {
            provider: payload.providerDisplayName,
          })}
          className="h-8 w-8 shrink-0 rounded"
          onError={(event) => {
            (event.target as HTMLImageElement).style.visibility = 'hidden';
          }}
        />
        <div className="flex-1 min-w-0">
          <p className="break-words text-sm font-medium text-bolt-elements-textPrimary">
            {formatChatConnectorsCopy(copy['chatConnectors.connection.connect'], {
              provider: payload.providerDisplayName,
            })}
          </p>
          <p className="mt-1 break-words text-xs text-bolt-elements-textSecondary">{payload.reason}</p>

          {scopes.length > 0 ? (
            <details className="mt-2">
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs text-bolt-elements-textSecondary">
                {formatChatConnectorsPlural(language, scopes.length, {
                  one: copy['chatConnectors.connection.permissions_one'],
                  other: copy['chatConnectors.connection.permissions_other'],
                })}
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
              <p className="text-xs text-bolt-elements-textSecondary">{copy['chatConnectors.connection.existing']}</p>
              {existingConnections.map((existing) => (
                <div
                  key={existing.userConnectionId}
                  className="flex flex-col items-stretch justify-between gap-3 rounded border border-bolt-elements-borderColor p-2 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="break-words text-xs font-medium text-bolt-elements-textPrimary">
                      {existing.accountLabel}
                    </p>
                    <p className="text-xs text-bolt-elements-textTertiary">
                      {existing.scopesMatch
                        ? copy['chatConnectors.connection.scopesMatch']
                        : copy['chatConnectors.connection.scopesDiffer']}
                    </p>
                  </div>
                  <Button
                    onClick={() => linkExisting(existing.userConnectionId, existing.accountLabel)}
                    disabled={pendingExistingId === existing.userConnectionId}
                    className="min-h-11 whitespace-normal sm:shrink-0"
                  >
                    {pendingExistingId === existing.userConnectionId
                      ? copy['chatConnectors.connection.linking']
                      : copy['chatConnectors.connection.useThis']}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-3 flex items-center gap-2">
            <Button onClick={startOAuth} disabled={isLaunching} className="min-h-11 whitespace-normal">
              {isLaunching ? (
                <span className="flex items-center gap-2">
                  <span className="i-ph:spinner-gap-bold h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  {formatChatConnectorsCopy(copy['chatConnectors.connection.waiting'], {
                    provider: payload.providerDisplayName,
                  })}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="i-ph:plug h-4 w-4 shrink-0" aria-hidden />
                  {hasExisting
                    ? formatChatConnectorsCopy(copy['chatConnectors.connection.connectNew'], {
                        provider: payload.providerDisplayName,
                      })
                    : formatChatConnectorsCopy(copy['chatConnectors.connection.connect'], {
                        provider: payload.providerDisplayName,
                      })}
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
