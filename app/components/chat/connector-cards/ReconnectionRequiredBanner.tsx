import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/Button';
import type { ReconnectionRequiredMessage, ReconnectionRequiredReason } from '~/lib/chat/connector-messages';
import { useConnectorPopup } from '~/lib/chat/use-connector-popup';
import {
  formatChatResidualsCopy,
  getChatResidualsCopy,
  getReconnectionReasonLabel,
} from '~/lib/i18n/catalogs/chat-residuals';

/*
 * Persistent inline banner rendered when the agent emits a
 * reconnection_required data part. Wired by the connector-proxy
 * sidecar (via the token-health-check worker or a real-time 401 on
 * the next provider call), this card prompts the builder to reopen
 * the OAuth popup. The flow reuses the shared useConnectorPopup hook
 * so the postMessage round trip is identical to the original Connect
 * card.
 */

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
export function reasonLabel(
  reason: ReconnectionRequiredReason | string | undefined,
  language: string | null | undefined = 'en',
): string {
  return getReconnectionReasonLabel(language, reason);
}

export interface ReconnectionRequiredBannerProps {
  payload: ReconnectionRequiredMessage;
  projectId?: string;
}

export function ReconnectionRequiredBanner({ payload, projectId }: ReconnectionRequiredBannerProps) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getChatResidualsCopy(language);
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
        setNetworkError(copy['chatResiduals.reconnection.startFailed']);

        return;
      }

      const result = (await response.json()) as { provider?: unknown; authorizationUrl?: unknown };

      if (
        typeof result.authorizationUrl !== 'string' ||
        typeof result.provider !== 'string' ||
        result.provider !== payload.provider
      ) {
        setNetworkError(copy['chatResiduals.reconnection.startFailed']);

        return;
      }

      launch({ authorizationUrl: result.authorizationUrl, provider: result.provider });
    } catch {
      /*
       * launch() is never reached on a transport failure, so the hook
       * stays 'idle' and the button silently reverts. Surface the error
       * inline so the builder gets feedback, mirroring ConnectionRequestCard.
       */
      setNetworkError(copy['chatResiduals.reconnection.startFailed']);
    }
  }, [copy, launch, payload.provider, projectId]);

  if (state.phase === 'succeeded') {
    return (
      <div className="my-2 flex min-w-0 items-center gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2">
        <span className="i-ph:check-circle-fill h-4 w-4 shrink-0 text-bolt-elements-icon-success" aria-hidden />
        <p className="min-w-0 break-words text-xs text-bolt-elements-textSecondary">
          {formatChatResidualsCopy(copy['chatResiduals.reconnection.success'], {
            provider: payload.providerDisplayName,
            account: state.result.accountLabel,
          })}
        </p>
      </div>
    );
  }

  const isLaunching = state.phase === 'launching';

  return (
    <div className="my-2 min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3">
      <div className="flex items-start gap-3">
        <span className="i-ph:warning-fill mt-0.5 h-5 w-5 shrink-0 text-bolt-elements-icon-warning" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium text-bolt-elements-textPrimary">
            {formatChatResidualsCopy(copy['chatResiduals.reconnection.title'], {
              provider: payload.providerDisplayName,
            })}
          </p>
          <p className="mt-1 break-words text-xs text-bolt-elements-textSecondary">
            {reasonLabel(payload.reason, language)}
          </p>
          <Button
            type="button"
            onClick={startReconnect}
            disabled={isLaunching}
            className="mt-2 min-h-11 max-w-full whitespace-normal"
          >
            {isLaunching
              ? copy['chatResiduals.reconnection.waiting']
              : formatChatResidualsCopy(copy['chatResiduals.reconnection.action'], {
                  provider: payload.providerDisplayName,
                })}
          </Button>
          {networkError || state.phase === 'failed' ? (
            <p role="alert" className="mt-2 text-xs text-bolt-elements-icon-error">
              {networkError ?? copy['chatResiduals.reconnection.authorizationFailed']}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
