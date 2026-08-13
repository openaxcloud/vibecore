import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '~/components/ui/Button';
import { logStore } from '~/lib/stores/logs';

/*
 * Connect button for the new UserConnection-backed GitLab OAuth flow.
 * Mirrors GitHubOauthConnectButton: opens a popup at
 * /api/integrations/oauth/gitlab/connect, listens for the postMessage
 * the /integrations/oauth/gitlab/callback page emits, and surfaces the
 * connection status to the parent.
 *
 * Coexists with the legacy PAT input still shown by GitLabConnection.tsx
 * for the duration of the migration window.
 */

interface OauthConnectResponse {
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

export interface GitLabOauthConnectButtonProps {
  projectId?: string;
  className?: string;
  onConnected?: (input: { userConnectionId: string; accountLabel: string }) => void;
}

export function GitLabOauthConnectButton({ projectId, className, onConnected }: GitLabOauthConnectButtonProps) {
  const [isLaunching, setIsLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
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

      if (event.data.provider !== 'gitlab') {
        return;
      }

      closePopupTracking();
      setIsLaunching(false);

      if (event.data.type === 'e-code.connector.connection.resolved') {
        setError(null);
        setSuccess(`Connected as ${event.data.accountLabel}`);
        logStore.logSystem(`GitLab OAuth connection established for ${event.data.accountLabel}`);
        onConnected?.({ userConnectionId: event.data.userConnectionId, accountLabel: event.data.accountLabel });
      } else {
        const message = event.data.errorMessage ?? 'GitLab connection failed.';
        setError(message);
        logStore.logError('GitLab OAuth connection failed', {
          code: event.data.errorCode,
          message,
        });
      }
    }

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [closePopupTracking, onConnected]);

  const handleClick = useCallback(async () => {
    setError(null);
    setSuccess(null);
    setIsLaunching(true);

    try {
      const response = await fetch('/api/integrations/oauth/gitlab/connect', {
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

      const result = (await response.json()) as OauthConnectResponse;

      const popup = window.open(
        result.authorizationUrl,
        'e-code-gitlab-oauth',
        'width=720,height=820,resizable=yes,scrollbars=yes',
      );

      if (!popup) {
        setError('Popup was blocked. Allow popups for this site and try again.');
        setIsLaunching(false);

        return;
      }

      popupRef.current = popup;

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
            Waiting for GitLab authorization...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="i-ph:gitlab-logo w-4 h-4" />
            Connect with GitLab (OAuth)
          </span>
        )}
      </Button>
      {error ? (
        <p className="mt-2 text-xs text-bolt-elements-icon-error dark:text-bolt-elements-icon-error">{error}</p>
      ) : null}
      {success ? (
        <p className="mt-2 text-xs text-bolt-elements-icon-success dark:text-bolt-elements-icon-success">{success}</p>
      ) : null}
    </div>
  );
}
