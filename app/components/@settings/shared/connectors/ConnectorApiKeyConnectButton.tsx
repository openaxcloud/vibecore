import { useCallback, useState } from 'react';
import { Button } from '~/components/ui/Button';
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
  tokenLabel = 'Access Token',
  tokenPlaceholder,
  helpUrl,
  helpLabel = 'Generate a token',
  projectId,
  onConnected,
  className,
}: ConnectorApiKeyConnectButtonProps) {
  const [expanded, setExpanded] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setBusy(true);
      setError(null);
      setSuccess(null);

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
          error?: string;
        };

        if (!response.ok || !data.userConnectionId || !data.accountLabel) {
          const message = data.error ?? `Failed to validate token (HTTP ${response.status})`;
          setError(message);
          logStore.logError(`${displayName} api-key connect failed`, { code: data.code, message });
          setBusy(false);

          return;
        }

        setSuccess(`Connected as ${data.accountLabel}`);
        setToken('');
        setExpanded(false);
        logStore.logSystem(`${displayName} connection established for ${data.accountLabel}`);
        onConnected?.({ userConnectionId: data.userConnectionId, accountLabel: data.accountLabel });
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Unknown failure submitting the token.';
        setError(message);
        logStore.logError(`${displayName} api-key connect threw`, { message });
      } finally {
        setBusy(false);
      }
    },
    [displayName, onConnected, projectId, provider, token],
  );

  if (!expanded) {
    return (
      <div className={className}>
        <Button onClick={() => setExpanded(true)}>
          <span className="flex items-center gap-2">
            <span className="i-ph:key w-4 h-4" />
            Connect {displayName} (API key)
          </span>
        </Button>
        {success ? (
          <p className="mt-2 text-xs text-bolt-elements-icon-success dark:text-bolt-elements-icon-success">{success}</p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={classNames('space-y-2 max-w-md', className)}>
      <label className="block text-sm text-bolt-elements-textSecondary">{tokenLabel}</label>
      <input
        type="password"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        disabled={busy}
        placeholder={tokenPlaceholder ?? `Paste your ${displayName} access token`}
        className={classNames(
          'w-full px-3 py-2 rounded-lg text-sm',
          'bg-bolt-elements-background-depth-1',
          'border border-bolt-elements-borderColor',
          'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
          'focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorActive',
          'disabled:opacity-50',
        )}
      />
      {helpUrl ? (
        <a
          href={helpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-bolt-elements-borderColorActive hover:underline inline-flex items-center gap-1"
        >
          {helpLabel}
          <span className="i-ph:arrow-square-out w-3 h-3" />
        </a>
      ) : null}
      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" disabled={busy || !token.trim()}>
          {busy ? (
            <span className="flex items-center gap-2">
              <span className="i-ph:spinner-gap-bold animate-spin w-4 h-4" />
              Validating...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span className="i-ph:plug-charging w-4 h-4" />
              Save token
            </span>
          )}
        </Button>
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            setError(null);
            setSuccess(null);
            setToken('');
          }}
          disabled={busy}
          className="text-xs text-bolt-elements-textSecondary hover:underline disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p className="text-xs text-bolt-elements-icon-error dark:text-bolt-elements-icon-error">{error}</p>
      ) : null}
      {success ? (
        <p className="text-xs text-bolt-elements-icon-success dark:text-bolt-elements-icon-success">{success}</p>
      ) : null}
    </form>
  );
}
