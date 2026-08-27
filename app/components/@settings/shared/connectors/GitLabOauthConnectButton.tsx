import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/Button';
import {
  formatSettingsConnectorsResidualCopy,
  getSettingsConnectorsResidualCopy,
} from '~/lib/i18n/catalogs/settings-connectors-residual';
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
  const { i18n } = useTranslation();
  const copy = getSettingsConnectorsResidualCopy(i18n.resolvedLanguage ?? i18n.language);
  const [isLaunching, setIsLaunching] = useState(false);
  const [errorCode, setErrorCode] = useState<'connection' | 'start' | 'popup' | null>(null);
  const [connectedAccount, setConnectedAccount] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<number | null>(null);
  const errorMessage = errorCode ? copy[`settingsResidual.gitlabOauth.error.${errorCode}`] : null;

  const successMessage = connectedAccount
    ? formatSettingsConnectorsResidualCopy(copy['settingsResidual.gitlabOauth.connected'], {
        account: connectedAccount,
      })
    : null;

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
        setErrorCode(null);
        setConnectedAccount(event.data.accountLabel);
        logStore.logSystem(`GitLab OAuth connection established for ${event.data.accountLabel}`);
        onConnected?.({ userConnectionId: event.data.userConnectionId, accountLabel: event.data.accountLabel });
      } else {
        setConnectedAccount(null);
        setErrorCode('connection');
        logStore.logError('GitLab OAuth connection failed', {
          code: event.data.errorCode,
        });
      }
    }

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [closePopupTracking, onConnected]);

  const handleClick = useCallback(async () => {
    setErrorCode(null);
    setConnectedAccount(null);
    setIsLaunching(true);

    try {
      const response = await fetch('/api/integrations/oauth/gitlab/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(projectId ? { projectId } : {}),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { code?: string };
        setErrorCode('start');
        logStore.logError('GitLab OAuth flow failed to start', { code: payload.code, status: response.status });
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
        setErrorCode('popup');
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
      setErrorCode('start');
      logStore.logError('GitLab OAuth flow failed to start', {
        name: caught instanceof Error ? caught.name : 'UnknownError',
      });
      setIsLaunching(false);
    }
  }, [closePopupTracking, projectId]);

  return (
    <div className={className}>
      <Button onClick={handleClick} disabled={isLaunching} className="min-h-11 max-w-full whitespace-normal">
        {isLaunching ? (
          <span className="flex min-w-0 items-center gap-2" role="status" aria-live="polite">
            <span className="i-ph:spinner-gap-bold h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            <span className="break-words text-left">{copy['settingsResidual.gitlabOauth.waiting']}</span>
          </span>
        ) : (
          <span className="flex min-w-0 items-center gap-2">
            <span className="i-ph:gitlab-logo h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="break-words text-left">{copy['settingsResidual.gitlabOauth.connect']}</span>
          </span>
        )}
      </Button>
      {errorMessage ? (
        <p
          className="mt-2 break-words text-xs text-bolt-elements-icon-error dark:text-bolt-elements-icon-error"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}
      {successMessage ? (
        <p
          className="mt-2 break-words text-xs text-bolt-elements-icon-success dark:text-bolt-elements-icon-success"
          role="status"
          aria-live="polite"
        >
          {successMessage}
        </p>
      ) : null}
    </div>
  );
}
