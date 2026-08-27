import { useCallback, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/Button';
import {
  formatSettingsConnectorsResidualCopy,
  getSettingsConnectorsResidualCopy,
} from '~/lib/i18n/catalogs/settings-connectors-residual';
import { logStore } from '~/lib/stores/logs';
import { classNames } from '~/utils/classNames';

/*
 * Reusable inline connect form for api_key connectors (Vercel,
 * Supabase, Netlify). Posts the token to the API service's
 * POST /api/integrations/api-key/:provider/configure endpoint, which
 * validates the token, encrypts it through packages/security, and
 * upserts a UserConnection. The decrypted token never reaches the
 * browser after submission - subsequent provider calls go through the
 * connector-proxy sidecar.
 *
 * Distinct from the legacy PAT form still rendered by the per-provider
 * Settings tabs (VercelConnection, SupabaseConnection, NetlifyConnection)
 * for the duration of the migration window.
 */

export interface ConnectorApiKeyConnectButtonProps {
  provider: 'vercel' | 'supabase' | 'netlify';
  displayName: string;
  tokenLabel?: string;
  tokenPlaceholder?: string;
  helpUrl?: string;
  helpLabel?: string;
  projectId?: string;
  onConnected?: (input: { userConnectionId: string; accountLabel: string }) => void;
  className?: string;
}

interface ConfigureResponse {
  userConnectionId: string;
  provider: string;
  accountLabel: string;
}

export function ConnectorApiKeyConnectButton({
  provider,
  displayName,
  tokenLabel,
  tokenPlaceholder,
  helpUrl,
  helpLabel,
  projectId,
  onConnected,
  className,
}: ConnectorApiKeyConnectButtonProps) {
  const { i18n } = useTranslation();
  const copy = getSettingsConnectorsResidualCopy(i18n.resolvedLanguage ?? i18n.language);
  const generatedId = useId();
  const [expanded, setExpanded] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<'validation' | 'network' | null>(null);
  const [connectedAccount, setConnectedAccount] = useState<string | null>(null);
  const tokenInputId = `${generatedId}-token`;
  const errorId = `${generatedId}-error`;
  const successId = `${generatedId}-success`;
  const resolvedTokenLabel = tokenLabel ?? copy['settingsResidual.apiKey.tokenLabel'];
  const resolvedHelpLabel = helpLabel ?? copy['settingsResidual.apiKey.help'];

  const connectedMessage = connectedAccount
    ? formatSettingsConnectorsResidualCopy(copy['settingsResidual.apiKey.connected'], { account: connectedAccount })
    : null;
  const errorMessage = errorCode
    ? formatSettingsConnectorsResidualCopy(copy[`settingsResidual.apiKey.error.${errorCode}`], {
        provider: displayName,
      })
    : null;

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setBusy(true);
      setErrorCode(null);
      setConnectedAccount(null);

      try {
        const payload: Record<string, string> = { apiKey: token.trim() };

        if (projectId) {
          payload.projectId = projectId;
        }

        const response = await fetch(`/api/integrations/api-key/${provider}/configure`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = (await response.json().catch(() => ({}))) as Partial<ConfigureResponse> & {
          code?: string;
        };

        if (!response.ok || !data.userConnectionId || !data.accountLabel) {
          setErrorCode('validation');
          logStore.logError(`${displayName} api-key connect failed`, { code: data.code, status: response.status });

          return;
        }

        setConnectedAccount(data.accountLabel);
        setToken('');
        setExpanded(false);
        logStore.logSystem(`${displayName} connection established for ${data.accountLabel}`);
        onConnected?.({ userConnectionId: data.userConnectionId, accountLabel: data.accountLabel });
      } catch (caught) {
        setErrorCode('network');
        logStore.logError(`${displayName} api-key connect threw`, {
          name: caught instanceof Error ? caught.name : 'UnknownError',
        });
      } finally {
        setBusy(false);
      }
    },
    [displayName, onConnected, projectId, provider, token],
  );

  if (!expanded) {
    return (
      <div className={classNames('min-w-0', className)}>
        <Button
          onClick={() => {
            setExpanded(true);
            setConnectedAccount(null);
          }}
          className="min-h-11 max-w-full whitespace-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="i-ph:key h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="break-words text-left">
              {formatSettingsConnectorsResidualCopy(copy['settingsResidual.apiKey.connect'], {
                provider: displayName,
              })}
            </span>
          </span>
        </Button>
        {connectedMessage ? (
          <p
            id={successId}
            className="mt-2 break-words text-xs text-bolt-elements-icon-success dark:text-bolt-elements-icon-success"
            role="status"
            aria-live="polite"
          >
            {connectedMessage}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={classNames('max-w-md min-w-0 space-y-2', className)}
      aria-label={formatSettingsConnectorsResidualCopy(copy['settingsResidual.apiKey.formLabel'], {
        provider: displayName,
      })}
      aria-busy={busy || undefined}
    >
      <label htmlFor={tokenInputId} className="block break-words text-sm text-bolt-elements-textSecondary">
        {resolvedTokenLabel}
      </label>
      <input
        id={tokenInputId}
        type="password"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        disabled={busy}
        placeholder={
          tokenPlaceholder ??
          formatSettingsConnectorsResidualCopy(copy['settingsResidual.apiKey.placeholder'], {
            provider: displayName,
          })
        }
        aria-invalid={errorMessage ? true : undefined}
        aria-describedby={errorMessage ? errorId : undefined}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        className={classNames(
          'min-h-11 w-full min-w-0 rounded-lg px-3 py-2 text-sm',
          'bg-bolt-elements-background-depth-1',
          'border border-bolt-elements-borderColor',
          'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-item-contentAccent',
          'disabled:opacity-50',
        )}
      />
      {helpUrl ? (
        <a
          href={helpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 max-w-full items-center gap-1 rounded text-xs text-bolt-elements-borderColorActive hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-item-contentAccent"
        >
          <span className="break-words">{resolvedHelpLabel}</span>
          <span className="i-ph:arrow-square-out h-3 w-3 shrink-0" aria-hidden="true" />
        </a>
      ) : null}
      <div className="flex flex-col items-stretch gap-2 pt-1 sm:flex-row sm:items-center">
        <Button type="submit" disabled={busy || !token.trim()} className="min-h-11 whitespace-normal">
          {busy ? (
            <span className="flex items-center gap-2" role="status" aria-live="polite">
              <span className="i-ph:spinner-gap-bold h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
              {copy['settingsResidual.apiKey.validating']}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span className="i-ph:plug-charging h-4 w-4 shrink-0" aria-hidden="true" />
              {copy['settingsResidual.apiKey.save']}
            </span>
          )}
        </Button>
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            setErrorCode(null);
            setConnectedAccount(null);
            setToken('');
          }}
          disabled={busy}
          className="min-h-11 rounded px-3 text-xs text-bolt-elements-textSecondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-item-contentAccent disabled:opacity-50"
        >
          {copy['settingsResidual.apiKey.cancel']}
        </button>
      </div>
      {errorMessage ? (
        <p
          id={errorId}
          className="break-words text-xs text-bolt-elements-icon-error dark:text-bolt-elements-icon-error"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}
    </form>
  );
}
