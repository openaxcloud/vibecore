import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { useConnectorPopup } from '~/lib/chat/use-connector-popup';
import {
  formatGitProviderConnectCopy,
  getGitProviderConnectCopy,
  type GitProviderConnectCopy,
} from '~/lib/i18n/catalogs/git-provider-connect';
import { classNames } from '~/utils/classNames';

type OAuthProviderId = 'github' | 'gitlab' | 'bitbucket';
type ProviderCardId = OAuthProviderId | 'custom';

type ProviderCard = {
  id: ProviderCardId;
  label: string;
  icon: string;
  description: string;
  action: string;
  remotePlaceholder: string;
};

const PROVIDERS: ReadonlyArray<Pick<ProviderCard, 'id' | 'icon'>> = [
  { id: 'github', icon: 'i-ph:github-logo' },
  { id: 'gitlab', icon: 'i-ph:gitlab-logo' },
  { id: 'bitbucket', icon: 'i-ph:git-branch' },
  { id: 'custom', icon: 'i-ph:link-simple' },
];

function providerCard(provider: Pick<ProviderCard, 'id' | 'icon'>, copy: GitProviderConnectCopy): ProviderCard {
  const prefix = `gitProvider.${provider.id}` as const;

  return {
    ...provider,
    label: copy[`${prefix}.label`],
    description: copy[`${prefix}.description`],
    action: copy[`${prefix}.action`],
    remotePlaceholder: copy[`${prefix}.placeholder`],
  };
}

export interface GitProviderConnectPanelProps {
  projectId: string;
  gitRepositoryUrl?: string | null;
  defaultBranch?: string | null;
  workspaceId?: string;
  busy?: boolean;
  onConnected?: () => void | Promise<void>;
  onRemoteConfigured?: () => void | Promise<void>;
}

function providerLabel(provider: string, cards: ProviderCard[]) {
  return cards.find((item) => item.id === provider)?.label ?? provider;
}

export function GitProviderConnectPanel({
  projectId,
  gitRepositoryUrl,
  defaultBranch,
  workspaceId,
  busy = false,
  onConnected,
  onRemoteConfigured,
}: GitProviderConnectPanelProps) {
  const { i18n } = useTranslation();
  const copy = getGitProviderConnectCopy(i18n.resolvedLanguage ?? i18n.language);
  const providerCards = useMemo(() => PROVIDERS.map((provider) => providerCard(provider, copy)), [copy]);
  const { state, launch, reset } = useConnectorPopup();
  const [pendingProvider, setPendingProvider] = useState<OAuthProviderId | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [remoteProvider, setRemoteProvider] = useState<ProviderCardId | null>(null);
  const [remoteUrl, setRemoteUrl] = useState(gitRepositoryUrl ?? '');
  const [branch, setBranch] = useState(defaultBranch ?? 'main');
  const [configuringRemote, setConfiguringRemote] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const handledConnectionRef = useRef<string | null>(null);

  const activeRemoteProvider = useMemo(
    () => providerCards.find((provider) => provider.id === remoteProvider) ?? providerCards[0],
    [providerCards, remoteProvider],
  );

  useEffect(() => {
    if (!remoteProvider) {
      setRemoteUrl(gitRepositoryUrl ?? '');
    }
  }, [gitRepositoryUrl, remoteProvider]);

  useEffect(() => {
    if (state.phase !== 'succeeded') {
      return;
    }

    const connectionKey = `${state.result.provider}:${state.result.userConnectionId}`;

    if (handledConnectionRef.current === connectionKey) {
      return;
    }

    handledConnectionRef.current = connectionKey;

    const label = providerLabel(state.result.provider, providerCards);
    toast.success(
      formatGitProviderConnectCopy(copy['gitProvider.connectedToast'], {
        provider: label,
        account: state.result.accountLabel,
      }),
    );
    setPendingProvider(null);
    setNetworkError(null);
    void onConnected?.();
  }, [copy, onConnected, providerCards, state]);

  useEffect(() => {
    if (state.phase !== 'failed') {
      return;
    }

    setPendingProvider(null);
    setNetworkError(
      formatGitProviderConnectCopy(copy['gitProvider.connectionFailed'], {
        provider: providerLabel(state.result.provider, providerCards),
      }),
    );
  }, [copy, providerCards, state]);

  const startOAuth = useCallback(
    async (provider: OAuthProviderId) => {
      setNetworkError(null);
      setPendingProvider(provider);
      handledConnectionRef.current = null;
      reset();

      try {
        const response = await fetch(`/api/integrations/oauth/${provider}/connect`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectId }),
        });

        if (!response.ok) {
          setPendingProvider(null);
          setNetworkError(
            formatGitProviderConnectCopy(copy['gitProvider.oauthStartFailed'], {
              provider: providerLabel(provider, providerCards),
            }),
          );

          return;
        }

        const result = (await response.json()) as { provider: string; authorizationUrl: string };
        launch({ authorizationUrl: result.authorizationUrl, provider: result.provider });
      } catch {
        setPendingProvider(null);
        setNetworkError(
          formatGitProviderConnectCopy(copy['gitProvider.oauthStartFailed'], {
            provider: providerLabel(provider, providerCards),
          }),
        );
      }
    },
    [copy, launch, projectId, providerCards, reset],
  );

  const openRemoteDrawer = useCallback(
    (provider: ProviderCardId) => {
      setRemoteProvider(provider);
      setRemoteError(null);
      setBranch(defaultBranch ?? 'main');

      if (gitRepositoryUrl) {
        setRemoteUrl(gitRepositoryUrl);
      } else {
        setRemoteUrl('');
      }
    },
    [defaultBranch, gitRepositoryUrl],
  );

  const submitRemote = useCallback(
    async (url: string, branchName: string) => {
      setRemoteError(null);
      setConfiguringRemote(true);

      try {
        const formData = new FormData();
        formData.set('intent', 'configure-remote');
        formData.set('remoteUrl', url.trim());
        formData.set('branch', branchName.trim() || 'main');

        if (workspaceId) {
          formData.set('workspaceId', workspaceId);
        }

        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ide-panel/git`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          setRemoteError(copy['gitProvider.remote.saveFailed']);

          return;
        }

        toast.success(
          formatGitProviderConnectCopy(copy['gitProvider.remote.savedToast'], {
            branch: branchName.trim() || 'main',
          }),
        );
        setRemoteProvider(null);
        setShowRepoPicker(false);
        void onRemoteConfigured?.();
      } catch {
        setRemoteError(copy['gitProvider.remote.saveFailed']);
      } finally {
        setConfiguringRemote(false);
      }
    },
    [copy, onRemoteConfigured, projectId, workspaceId],
  );

  const configureRemote = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submitRemote(remoteUrl, branch);
    },
    [branch, remoteUrl, submitRemote],
  );

  const isLaunching = state.phase === 'launching';
  const succeeded = state.phase === 'succeeded' ? state.result : null;

  return (
    <div className="grid gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <strong className="block break-words text-amber-700 dark:text-amber-200">{copy['gitProvider.title']}</strong>
          <p className="mt-1 max-w-2xl break-words text-amber-700/85 dark:text-amber-100/85">
            {copy['gitProvider.description']}
          </p>
        </div>
        {gitRepositoryUrl ? (
          <span className="max-w-full truncate rounded-md border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-200">
            {gitRepositoryUrl}
          </span>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label={copy['gitProvider.providersAria']}>
        {providerCards.map((provider) => {
          const providerLaunching = isLaunching && pendingProvider === provider.id;
          const providerSucceeded = succeeded?.provider === provider.id;
          const isOAuthProvider = provider.id !== 'custom';

          /*
           * pendingProvider is set synchronously on click (before the async
           * launch), so gating on it directly closes the double-click window
           * between the click and isLaunching flipping true.
           */
          const providerDisabled =
            busy ||
            providerLaunching ||
            (isLaunching && isOAuthProvider) ||
            pendingProvider === provider.id ||
            (pendingProvider !== null && isOAuthProvider);

          return (
            <button
              key={provider.id}
              type="button"
              className={classNames(
                'group grid min-h-[132px] gap-2 rounded-md border border-amber-500/25 bg-bolt-elements-background-depth-1 p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus',
                'hover:border-amber-500/50 hover:bg-bolt-elements-background-depth-2 disabled:cursor-not-allowed disabled:opacity-60',
              )}
              disabled={providerDisabled}
              aria-label={formatGitProviderConnectCopy(copy['gitProvider.cardAria'], {
                action: provider.action,
              })}
              onClick={() => {
                if (provider.id === 'custom') {
                  openRemoteDrawer(provider.id);
                } else {
                  void startOAuth(provider.id);
                }
              }}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={classNames(provider.icon, 'h-4 w-4 text-bolt-elements-item-contentAccent')} />
                  <span className="break-words text-xs font-semibold text-bolt-elements-textPrimary">
                    {provider.label}
                  </span>
                </span>
                {providerSucceeded ? (
                  <span className="i-ph:check-circle-fill h-4 w-4 text-bolt-elements-icon-success" aria-hidden />
                ) : null}
              </span>
              <span className="break-words text-[11px] leading-4 text-bolt-elements-textSecondary">
                {provider.description}
              </span>
              <span className="mt-auto inline-flex flex-wrap items-center gap-1 break-words text-xs font-semibold text-bolt-elements-item-contentAccent">
                {providerLaunching ? (
                  <>
                    <span className="i-ph:spinner-gap-bold h-3.5 w-3.5 animate-spin" aria-hidden />
                    {copy['gitProvider.waitingOauth']}
                  </>
                ) : providerSucceeded ? (
                  formatGitProviderConnectCopy(copy['gitProvider.connectedAs'], {
                    account: succeeded.accountLabel,
                  })
                ) : (
                  provider.action
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/*
       * Pick from the user's GitHub repositories (Replit parity): reuses the
       * signed-in user's encrypted OAuth token server-side via /api/github-stats;
       * selecting a repo sets it as the project origin (configure-remote).
       */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowRepoPicker((value) => !value)}
          className="inline-flex min-h-8 items-center gap-1.5 whitespace-normal rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-1.5 text-left text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2"
        >
          <span className="i-ph:git-fork h-4 w-4 text-bolt-elements-item-contentAccent" aria-hidden />
          {showRepoPicker ? copy['gitProvider.repoPicker.hide'] : copy['gitProvider.repoPicker.show']}
        </button>
      </div>

      {showRepoPicker ? (
        <GitHubRepoPicker
          copy={copy}
          busy={configuringRemote || busy}
          onSelect={(url, repoBranch) => void submitRemote(url, repoBranch)}
        />
      ) : null}

      {networkError ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-500" role="alert">
          {networkError}
        </div>
      ) : null}

      {remoteProvider ? (
        <div
          className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
          role="dialog"
          aria-label={formatGitProviderConnectCopy(copy['gitProvider.remote.dialogAria'], {
            provider: activeRemoteProvider.label,
          })}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="break-words text-sm font-semibold text-bolt-elements-textPrimary">
                {formatGitProviderConnectCopy(copy['gitProvider.remote.title'], {
                  provider: activeRemoteProvider.label,
                })}
              </h3>
              <p className="mt-1 break-words text-xs text-bolt-elements-textSecondary">
                {copy['gitProvider.remote.description']}
              </p>
            </div>
            <button
              type="button"
              className="rounded-md border border-bolt-elements-borderColor px-2 py-1 text-xs text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3"
              onClick={() => setRemoteProvider(null)}
            >
              {copy['gitProvider.remote.close']}
            </button>
          </div>
          <form onSubmit={configureRemote} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_auto]">
            <label className="grid gap-1 text-xs font-medium text-bolt-elements-textSecondary">
              {copy['gitProvider.remote.url']}
              <input
                className="h-9 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
                value={remoteUrl}
                onChange={(event) => setRemoteUrl(event.currentTarget.value)}
                placeholder={activeRemoteProvider.remotePlaceholder}
                required
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-bolt-elements-textSecondary">
              {copy['gitProvider.remote.defaultBranch']}
              <input
                className="h-9 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
                value={branch}
                onChange={(event) => setBranch(event.currentTarget.value)}
                placeholder={copy['gitProvider.remote.defaultBranchPlaceholder']}
                required
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                className="inline-flex min-h-9 w-full items-center justify-center whitespace-normal rounded-md bg-bolt-elements-button-primary-background px-3 py-2 text-center text-sm font-medium text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover disabled:opacity-60"
                disabled={configuringRemote || busy}
              >
                {configuringRemote ? copy['gitProvider.remote.saving'] : copy['gitProvider.remote.save']}
              </button>
            </div>
          </form>
          {remoteError ? (
            <p className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-500" role="alert">
              {remoteError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type GitHubRepo = {
  id: number;
  full_name: string;
  html_url: string;
  clone_url?: string;
  default_branch: string;
  private: boolean;
};

/*
 * Lists the signed-in user's GitHub repositories (via the encrypted OAuth token,
 * server-side /api/github-stats) so they can connect one as the project origin
 * with a single click — no need to paste a URL. Falls back to a clear message
 * when GitHub isn't connected yet.
 */
function GitHubRepoPicker({
  copy,
  busy = false,
  onSelect,
}: {
  copy: GitProviderConnectCopy;
  busy?: boolean;
  onSelect: (cloneUrl: string, defaultBranch: string) => void;
}) {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<401 | 500 | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErrorStatus(null);

      try {
        const response = await fetch('/api/github-stats');

        if (response.status === 401) {
          if (!cancelled) {
            setErrorStatus(401);
          }

          return;
        }

        if (!response.ok) {
          if (!cancelled) {
            setErrorStatus(500);
          }

          return;
        }

        const data = (await response.json()) as { repos?: GitHubRepo[] };

        if (!cancelled) {
          setRepos(Array.isArray(data.repos) ? data.repos : []);
        }
      } catch {
        if (!cancelled) {
          setErrorStatus(500);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (!needle) {
      return repos;
    }

    return repos.filter((repo) => repo.full_name.toLowerCase().includes(needle));
  }, [query, repos]);

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
      <label className="grid gap-1 text-xs font-medium text-bolt-elements-textSecondary">
        {copy['gitProvider.repositories.search']}
        <input
          className="h-9 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={copy['gitProvider.repositories.placeholder']}
        />
      </label>

      <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-bolt-elements-borderColor">
        {loading ? (
          <p className="flex items-center gap-2 p-3 text-xs text-bolt-elements-textSecondary">
            <span className="i-ph:spinner-gap-bold h-3.5 w-3.5 animate-spin" aria-hidden />
            {copy['gitProvider.repositories.loading']}
          </p>
        ) : errorStatus ? (
          <p className="p-3 text-xs text-red-500" role="alert">
            {errorStatus === 401
              ? copy['gitProvider.repositories.connectFirst']
              : copy['gitProvider.repositories.loadFailed']}
          </p>
        ) : filtered.length === 0 ? (
          <p className="break-words p-3 text-xs text-bolt-elements-textSecondary">
            {formatGitProviderConnectCopy(copy['gitProvider.repositories.noMatch'], { query })}
          </p>
        ) : (
          <ul>
            {filtered.map((repo) => (
              <li key={repo.id} className="border-b border-bolt-elements-borderColor last:border-b-0">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSelect(repo.clone_url || `${repo.html_url}.git`, repo.default_branch || 'main')}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="i-ph:git-branch h-3.5 w-3.5 shrink-0 text-bolt-elements-textTertiary"
                      aria-hidden
                    />
                    <span className="truncate text-xs font-medium text-bolt-elements-textPrimary">
                      {repo.full_name}
                    </span>
                    {repo.private ? (
                      <span className="shrink-0 rounded bg-bolt-elements-background-depth-3 px-1.5 py-0.5 text-[11px] text-bolt-elements-textTertiary">
                        {copy['gitProvider.repositories.private']}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-[11px] font-medium text-bolt-elements-item-contentAccent">
                    {copy['gitProvider.repositories.connect']}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
