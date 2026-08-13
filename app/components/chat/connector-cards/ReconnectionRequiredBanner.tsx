import { useCallback, useState } from 'react';
import { Button } from '~/components/ui/Button';
import type { ReconnectionRequiredMessage, ReconnectionRequiredReason } from '~/lib/chat/connector-messages';
import { useConnectorPopup } from '~/lib/chat/use-connector-popup';

/*
 * Persistent inline banner rendered when the agent emits a
 * reconnection_required data part. Wired by the connector-proxy
 * sidecar (via the token-health-check worker or a real-time 401 on
 * the next provider call), this card prompts the builder to reopen
 * the OAuth popup. The flow reuses the shared useConnectorPopup hook
 * so the postMessage round trip is identical to the original Connect
 * card.
 */

const REASON_LABEL: Record<ReconnectionRequiredReason, string> = {
  token_expired: 'The access token expired.',
  token_revoked: 'The token was revoked at the provider.',
  scope_insufficient: 'The current scopes no longer cover the agent request.',
};

const GENERIC_REASON_LABEL = 'Reconnection is required to continue.';

/*
 * Resolve a reconnection reason to a human-readable label. The upstream
 * data-part filter (isConnectorDataPart) only checks that `kind` is a
 * string, so `reason` is not validated against ReconnectionRequiredReason.
 * A persisted/imported part, or an agent/proxy emitting an unknown or
 * undefined reason, would otherwise produce `undefined`, which React
 * renders as nothing — leaving the banner with a blank explanation line.
 * Fall back to a generic label so the banner always tells the builder
 * why reconnection is needed.
 */
export function reasonLabel(reason: ReconnectionRequiredReason | string | undefined): string {
  return (reason != null && REASON_LABEL[reason as ReconnectionRequiredReason]) || GENERIC_REASON_LABEL;
}

export interface ReconnectionRequiredBannerProps {
  payload: ReconnectionRequiredMessage;
  projectId?: string;
}

export function ReconnectionRequiredBanner({ payload, projectId }: ReconnectionRequiredBannerProps) {
  const { state, launch } = useConnectorPopup();
  const [networkError, setNetworkError] = useState<string | null>(null);

  const startReconnect = useCallback(async () => {
    setNetworkError(null);

    try {
      const response = await fetch(`/api/integrations/oauth/${payload.provider}/connect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(projectId ? { projectId } : {}),
      });

      if (!response.ok) {
        const parsed = (await response.json().catch(() => ({}))) as { error?: string };
        setNetworkError(parsed.error ?? `Failed to start reconnection (HTTP ${response.status})`);

        return;
      }

      const result = (await response.json()) as { provider: string; authorizationUrl: string };
      launch({ authorizationUrl: result.authorizationUrl, provider: result.provider });
    } catch (error) {
      /*
       * launch() is never reached on a transport failure, so the hook
       * stays 'idle' and the button silently reverts. Surface the error
       * inline so the builder gets feedback, mirroring ConnectionRequestCard.
       */
      setNetworkError(error instanceof Error ? error.message : 'Unknown failure starting reconnection.');
    }
  }, [launch, payload.provider, projectId]);

  if (state.phase === 'succeeded') {
    return (
      <div className="my-2 flex items-center gap-2 rounded-md border border-bolt-elements-borderColor px-3 py-2 bg-bolt-elements-background-depth-1">
        <span className="i-ph:check-circle-fill w-4 h-4 text-bolt-elements-icon-success" />
        <p className="text-xs text-bolt-elements-textSecondary">
          {payload.providerDisplayName} reconnected as <strong>{state.result.accountLabel}</strong>.
        </p>
      </div>
    );
  }

  const isLaunching = state.phase === 'launching';

  return (
    <div className="my-2 rounded-lg border border-bolt-elements-borderColor p-3 bg-bolt-elements-background-depth-1">
      <div className="flex items-start gap-3">
        <span className="i-ph:warning-fill w-5 h-5 text-bolt-elements-icon-warning mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-bolt-elements-textPrimary">Reconnect {payload.providerDisplayName}</p>
          <p className="text-xs text-bolt-elements-textSecondary mt-1">{reasonLabel(payload.reason)}</p>
          <Button onClick={startReconnect} disabled={isLaunching} className="mt-2">
            {isLaunching ? 'Waiting for authorization...' : `Reconnect ${payload.providerDisplayName}`}
          </Button>
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
