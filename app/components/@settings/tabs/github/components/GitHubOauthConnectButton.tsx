import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '~/components/ui/Button';
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
        const message = event.data.errorMessage ?? 'GitHub connection failed.';
        setError(message);
        logStore.logError('GitHub OAuth connection failed', {
          code: event.data.errorCode,
          message,
        });
      }
    }

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [closePopupTracking]);

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
        const payload = (await response.json().catch(() => ({}))) as { code?: string; error?: string };
        setError(payload.error ?? `Failed to start OAuth flow (HTTP ${response.status})`);
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
        setError('Popup was blocked. Allow popups for this site and try again.');
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
      setError(caught instanceof Error ? caught.message : 'Unknown failure starting OAuth flow.');
      setIsLaunching(false);
    }
  }, [closePopupTracking, projectId]);

  return (
    <div className={className}>
      <Button onClick={handleClick} disabled={isLaunching}>
        {isLaunching ? (
          <span className="flex items-center gap-2">
            <span className="i-ph:spinner-gap-bold animate-spin w-4 h-4" />
            Waiting for GitHub authorization...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="i-ph:github-logo w-4 h-4" />
            Connect with GitHub (OAuth)
          </span>
        )}
      </Button>
      {error ? (
        <p className="mt-2 text-xs text-bolt-elements-icon-error dark:text-bolt-elements-icon-error">{error}</p>
      ) : null}
    </div>
  );
}
