import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/Button';
import { getSourceControlConnectionsCopy } from '~/lib/i18n/catalogs/source-control-connections';
import { initializeGitHubConnection } from '~/lib/stores/github';
import { logStore } from '~/lib/stores/logs';

/*
 * Connect button for the new UserConnection-backed GitHub OAuth flow.
 *
 * Opens a popup at /api/integrations/oauth/github/connect, lets GitHub
 * redirect the popup to /integrations/oauth/github/callback, and reacts
 * to the postMessage emitted by that page. On success the parent calls
 * initializeGitHubConnection (which now reads the encrypted token via
 * the UserConnection-backed /api/github-user route) so the rest of the
 * tab refreshes automatically.
 *
 * Distinct from the legacy PAT input still shown by GitHubConnection.tsx;
 * both paths coexist during the migration window until the IDE panel
 * UI lands in Phase 3.
 */

interface OAuthConnectResponse {
  provider: string;
  authorizationUrl: string;
}

type ConnectorMessage =
  | {
      type: 'e-code.connector.connection.resolved';
      provider: string;
      userConnectionId: string;
      accountLabel: string;
      scopes?: string[];
    }
  | {
      type: 'e-code.connector.connection.failed';
      provider: string;
      errorCode?: string;
      errorMessage?: string;
    };

function isConnectorMessage(value: unknown): value is ConnectorMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as { type?: unknown };

  return (
    candidate.type === 'e-code.connector.connection.resolved' || candidate.type === 'e-code.connector.connection.failed'
  );
}

export interface GitHubOauthConnectButtonProps {
  /**
   * Optional project id to link the resulting UserConnection to. When
   * absent the flow is account-scoped (Settings → GitHub tab).
   */
  projectId?: string;
  className?: string;
}

export function GitHubOauthConnectButton({ projectId, className }: GitHubOauthConnectButtonProps) {
  const { i18n } = useTranslation();
  const copy = getSourceControlConnectionsCopy(i18n.resolvedLanguage ?? i18n.language);
  const [isLaunching, setIsLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<number | null>(null);

  const closePopupTracking = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }

    popupRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      closePopupTracking();
    };
  }, [closePopupTracking]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (!isConnectorMessage(event.data)) {
        return;
      }

      if (event.data.provider !== 'github') {
        return;
      }

      closePopupTracking();
      setIsLaunching(false);

      if (event.data.type === 'e-code.connector.connection.resolved') {
        setError(null);
        logStore.logSystem(`GitHub OAuth connection established for ${event.data.accountLabel}`);

        /*
         * Force re-initialization through the UserConnection-backed route so
         * the rest of the tab swaps to the server-side state.
         */
        void initializeGitHubConnection();
      } else {
        setError(copy['sourceControl.github.oauth.connectionFailed']);
        logStore.logError('GitHub OAuth connection failed', {
          code: event.data.errorCode,
        });
      }
    }

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [closePopupTracking, copy]);

  const handleClick = useCallback(async () => {
    setError(null);
    setIsLaunching(true);

    try {
      const response = await fetch('/api/integrations/oauth/github/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(projectId ? { projectId } : {}),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { code?: string };
        setError(copy['sourceControl.github.oauth.startFailed']);
        logStore.logError('GitHub OAuth flow failed to start', { code: payload.code, status: response.status });
        setIsLaunching(false);

        return;
      }

      const result = (await response.json()) as OAuthConnectResponse;

      const popup = window.open(
        result.authorizationUrl,
        'e-code-github-oauth',
        'width=720,height=820,resizable=yes,scrollbars=yes',
      );

      if (!popup) {
        setError(copy['sourceControl.github.oauth.popupBlocked']);
        setIsLaunching(false);

        return;
      }

      popupRef.current = popup;

      /*
       * Detect manual close so the button does not stay stuck in the
       * launching state when the user dismisses the popup without
       * completing the OAuth flow.
       */
      pollRef.current = window.setInterval(() => {
        if (popupRef.current?.closed) {
          closePopupTracking();
          setIsLaunching(false);
        }
      }, 500);
    } catch (caught) {
      console.error('GitHub OAuth flow failed to start', caught);
      setError(copy['sourceControl.github.oauth.startFailed']);
      setIsLaunching(false);
    }
  }, [closePopupTracking, copy, projectId]);

  return (
    <div className={className}>
      <Button onClick={handleClick} disabled={isLaunching} className="min-h-11 whitespace-normal">
        {isLaunching ? (
          <span className="flex items-center gap-2" role="status" aria-live="polite">
            <span className="i-ph:spinner-gap-bold animate-spin w-4 h-4 shrink-0" aria-hidden="true" />
            {copy['sourceControl.github.oauth.waiting']}
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="i-ph:github-logo w-4 h-4 shrink-0" aria-hidden="true" />
            {copy['sourceControl.github.oauth.connect']}
          </span>
        )}
      </Button>
      {error ? (
        <p className="mt-2 text-xs text-bolt-elements-icon-error dark:text-bolt-elements-icon-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
