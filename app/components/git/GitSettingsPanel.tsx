import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { toast } from 'react-toastify';
import { useConnectorPopup } from '~/lib/chat/use-connector-popup';
import { classNames } from '~/utils/classNames';

/*
 * Replit-parity Git Settings sub-pane (opened by the ⚙ in the Git pane header).
 * Three vertical sections — Remote · Connections · Commit author — and it stays
 * reachable even after a remote is configured (unlike the connect-only panel,
 * which hides once connected). Connections shows live per-provider status with
 * Sign in / Disconnect, reading + revoking through /api/git/connections.
 */
type OAuthProviderId = 'github' | 'gitlab' | 'bitbucket';

type Connection = {
  id: string;
  provider: string;
  externalAccountLabel: string;
  status: string;
  revokedAt: string | null;
};

const PROVIDERS: Array<{ id: OAuthProviderId; label: string; icon: string }> = [
  { id: 'github', label: 'GitHub', icon: 'i-ph:github-logo' },
  { id: 'gitlab', label: 'GitLab', icon: 'i-ph:gitlab-logo' },
  { id: 'bitbucket', label: 'Bitbucket', icon: 'i-ph:git-branch' },
];

function providerLabel(provider: string) {
  return PROVIDERS.find((item) => item.id === provider)?.label ?? provider;
}

/*
 * .gitignore editor — loads the project's .gitignore from the running workspace
 * (GET /api/projects/:id/files/.gitignore, empty when absent) and saves edits
 * back (POST { content }). Real file IO, no mock.
 */
function GitIgnoreEditor({ projectId }: { projectId: string }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | undefined>();
  const url = `/api/projects/${encodeURIComponent(projectId)}/files/.gitignore`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(url, { headers: { accept: 'text/plain' } })
      .then((response) => (response.ok ? response.text() : ''))
      .then((text) => {
        if (!cancelled) {
          setContent(text);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setContent('');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  const save = useCallback(async () => {
    setSaving(true);
    setStatus(undefined);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      setStatus(response.ok ? 'Saved' : 'Could not save');
    } catch {
      setStatus('Could not save');
    } finally {
      setSaving(false);
    }
  }, [content, url]);

  return (
    <section className="grid gap-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">.gitignore</h4>
      <textarea
        value={content}
        onChange={(event) => setContent(event.currentTarget.value)}
        disabled={loading}
        rows={6}
        spellCheck={false}
        aria-label=".gitignore contents"
        placeholder={loading ? 'Loading…' : 'node_modules\n.env\ndist'}
        className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1.5 font-mono text-xs outline-none focus:border-bolt-elements-focus"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || loading}
          className="inline-flex h-8 items-center justify-center rounded-md bg-bolt-elements-button-primary-background px-3 text-sm font-medium text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save .gitignore'}
        </button>
        {status ? <span className="text-xs text-bolt-elements-textTertiary">{status}</span> : null}
      </div>
    </section>
  );
}

/**
 * A reusable git identity. Stored globally (not per-project) under
 * COMMIT_AUTHOR_PROFILES_KEY so the same identities can be reused across every
 * project; switching one writes the per-project active-author key that GitTab
 * reads to prefill the commit form.
 */
interface AuthorProfile {
  id: string;
  name: string;
  email: string;
}

const COMMIT_AUTHOR_PROFILES_KEY = 'vibecore:git:commit-author-profiles';

function authorProfileId(name: string, email: string): string {
  return `${name.trim().toLowerCase()}|${email.trim().toLowerCase()}`;
}

export interface GitSettingsPanelProps {
  projectId: string;
  gitRepositoryUrl?: string | null;
  defaultBranch?: string | null;
  workspaceId?: string;
  busy?: boolean;
  onClose: () => void;
  onRemoteConfigured?: () => void | Promise<void>;
}

export function GitSettingsPanel({
  projectId,
  gitRepositoryUrl,
  defaultBranch,
  workspaceId,
  busy = false,
  onClose,
  onRemoteConfigured,
}: GitSettingsPanelProps) {
  const { state, launch, reset } = useConnectorPopup();
  const [pendingProvider, setPendingProvider] = useState<OAuthProviderId | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const handledConnectionRef = useRef<string | null>(null);

  const [remoteUrl, setRemoteUrl] = useState(gitRepositoryUrl ?? '');
  const [branch, setBranch] = useState(defaultBranch ?? 'main');
  const [savingRemote, setSavingRemote] = useState(false);
  const [removingRemote, setRemovingRemote] = useState(false);

  const authorStorageKey = useMemo(() => `vibecore:git:commit-author:${projectId}`, [projectId]);
  const [authorName, setAuthorName] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [authorProfiles, setAuthorProfiles] = useState<AuthorProfile[]>([]);

  useEffect(() => {
    setRemoteUrl(gitRepositoryUrl ?? '');
  }, [gitRepositoryUrl]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(authorStorageKey);

      if (raw) {
        const parsed = JSON.parse(raw) as { name?: string; email?: string };
        setAuthorName(parsed.name ?? '');
        setAuthorEmail(parsed.email ?? '');
      }
    } catch {
      // Ignore malformed/blocked storage; the fields just start empty.
    }
  }, [authorStorageKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COMMIT_AUTHOR_PROFILES_KEY);

      if (raw) {
        const parsed = JSON.parse(raw) as AuthorProfile[];

        if (Array.isArray(parsed)) {
          setAuthorProfiles(
            parsed.filter((entry) => entry && typeof entry.email === 'string' && typeof entry.id === 'string'),
          );
        }
      }
    } catch {
      // Ignore malformed/blocked storage; the saved-profiles list just starts empty.
    }
  }, []);

  const persistAuthorProfiles = useCallback((next: AuthorProfile[]) => {
    setAuthorProfiles(next);

    try {
      localStorage.setItem(COMMIT_AUTHOR_PROFILES_KEY, JSON.stringify(next));
    } catch {
      // Best-effort; in-memory state still reflects the change for this session.
    }
  }, []);

  // Writes the per-project active author that GitTab reads to prefill commits.
  const setActiveAuthor = useCallback(
    (name: string, email: string) => {
      try {
        if (name || email) {
          localStorage.setItem(authorStorageKey, JSON.stringify({ name, email }));
        } else {
          localStorage.removeItem(authorStorageKey);
        }
      } catch {
        // Ignore blocked storage; the in-memory fields below still update.
      }
    },
    [authorStorageKey],
  );

  const applyAuthorProfile = useCallback(
    (profile: AuthorProfile) => {
      setAuthorName(profile.name);
      setAuthorEmail(profile.email);
      setActiveAuthor(profile.name, profile.email);
      toast.success(`Commit author set to ${profile.name || profile.email}`);
    },
    [setActiveAuthor],
  );

  const saveAuthorAsProfile = useCallback(() => {
    const name = authorName.trim();
    const email = authorEmail.trim();

    if (!name && !email) {
      toast.error('Enter a name or email before saving a profile.');
      return;
    }

    const id = authorProfileId(name, email);
    const next = [{ id, name, email }, ...authorProfiles.filter((entry) => entry.id !== id)].slice(0, 12);
    persistAuthorProfiles(next);
    setActiveAuthor(name, email);
    toast.success('Commit author profile saved');
  }, [authorEmail, authorName, authorProfiles, persistAuthorProfiles, setActiveAuthor]);

  const removeAuthorProfile = useCallback(
    (id: string) => {
      persistAuthorProfiles(authorProfiles.filter((entry) => entry.id !== id));
    },
    [authorProfiles, persistAuthorProfiles],
  );

  const loadConnections = useCallback(async () => {
    setConnectionsLoading(true);

    try {
      const response = await fetch('/api/git/connections', { headers: { accept: 'application/json' } });
      const payload = (await response.json().catch(() => ({}))) as { connections?: Connection[] };
      setConnections(Array.isArray(payload.connections) ? payload.connections : []);
    } catch {
      setConnections([]);
    } finally {
      setConnectionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  const activeByProvider = useMemo(() => {
    const map = new Map<string, Connection>();

    for (const connection of connections) {
      if (!connection.revokedAt && connection.status !== 'revoked') {
        map.set(connection.provider, connection);
      }
    }

    return map;
  }, [connections]);

  // A successful OAuth popup → refresh the connections list + clear pending.
  useEffect(() => {
    if (state.phase !== 'succeeded') {
      return;
    }

    const connectionKey = `${state.result.provider}:${state.result.userConnectionId}`;

    if (handledConnectionRef.current === connectionKey) {
      return;
    }

    handledConnectionRef.current = connectionKey;
    toast.success(`${providerLabel(state.result.provider)} connected as ${state.result.accountLabel}`);
    setPendingProvider(null);
    void loadConnections();
  }, [state, loadConnections]);

  useEffect(() => {
    if (state.phase === 'failed') {
      setPendingProvider(null);
      toast.error(state.result.errorMessage ?? `${providerLabel(state.result.provider)} connection failed.`);
    }
  }, [state]);

  const startOAuth = useCallback(
    async (provider: OAuthProviderId) => {
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
          const parsed = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(parsed.error ?? `Failed to start ${providerLabel(provider)} OAuth (HTTP ${response.status})`);
        }

        const result = (await response.json()) as { provider: string; authorizationUrl: string };
        launch({ authorizationUrl: result.authorizationUrl, provider: result.provider });
      } catch (error) {
        setPendingProvider(null);
        toast.error(error instanceof Error ? error.message : 'Unable to start OAuth flow.');
      }
    },
    [launch, projectId, reset],
  );

  const disconnect = useCallback(
    async (connection: Connection) => {
      setRevoking(connection.id);

      try {
        const form = new FormData();
        form.set('intent', 'revoke');
        form.set('userConnectionId', connection.id);

        const response = await fetch('/api/git/connections', { method: 'POST', body: form });

        if (!response.ok) {
          const parsed = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(parsed.error ?? `Failed to disconnect (HTTP ${response.status})`);
        }

        toast.success(`${providerLabel(connection.provider)} disconnected`);
        await loadConnections();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to disconnect this account.');
      } finally {
        setRevoking(null);
      }
    },
    [loadConnections],
  );

  const saveRemote = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSavingRemote(true);

      try {
        const form = new FormData();
        form.set('intent', 'configure-remote');
        form.set('remoteUrl', remoteUrl.trim());
        form.set('branch', branch.trim() || 'main');

        if (workspaceId) {
          form.set('workspaceId', workspaceId);
        }

        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ide-panel/git`, {
          method: 'POST',
          body: form,
        });

        if (!response.ok) {
          const parsed = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(parsed.error ?? `Failed to save remote (HTTP ${response.status})`);
        }

        toast.success('Git remote saved');
        void onRemoteConfigured?.();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to save this Git remote.');
      } finally {
        setSavingRemote(false);
      }
    },
    [branch, onRemoteConfigured, projectId, remoteUrl, workspaceId],
  );

  const disconnectRemote = useCallback(async () => {
    setRemovingRemote(true);

    try {
      const form = new FormData();
      form.set('intent', 'remove-remote');

      if (workspaceId) {
        form.set('workspaceId', workspaceId);
      }

      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ide-panel/git`, {
        method: 'POST',
        body: form,
      });

      if (!response.ok) {
        const parsed = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(parsed.error ?? `Failed to remove remote (HTTP ${response.status})`);
      }

      setRemoteUrl('');
      toast.success('Git remote removed');
      void onRemoteConfigured?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to remove this Git remote.');
    } finally {
      setRemovingRemote(false);
    }
  }, [onRemoteConfigured, projectId, workspaceId]);

  const saveAuthor = useCallback(() => {
    setActiveAuthor(authorName.trim(), authorEmail.trim());
    toast.success('Default commit author saved');
  }, [authorEmail, authorName, setActiveAuthor]);

  /*
   * Fixed px (not rem) so the Git settings keep IDE density despite the ecode
   * app-wide responsive root-font scaling.
   */
  const inputClass =
    'h-[34px] w-full min-w-0 rounded-[6px] border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 text-[13px] text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus';

  const isLaunching = state.phase === 'launching';

  return (
    <div
      className="grid gap-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
      data-testid="git-settings-panel"
      aria-label="Git settings"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-bolt-elements-textPrimary">
          <span className="i-ph:gear text-base text-bolt-elements-item-contentAccent" aria-hidden />
          Git settings
        </h3>
        <button
          type="button"
          data-testid="git-settings-close"
          onClick={onClose}
          className="rounded-md border border-bolt-elements-borderColor px-2 py-1 text-xs text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3"
        >
          Done
        </button>
      </div>

      {/* Remote */}
      <section className="grid gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">Remote</h4>
        <form onSubmit={saveRemote} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px_auto]">
          <input
            className={inputClass}
            value={remoteUrl}
            onChange={(event) => setRemoteUrl(event.currentTarget.value)}
            placeholder="https://github.com/org/repo.git"
            aria-label="Remote origin URL"
            required
          />
          <input
            className={inputClass}
            value={branch}
            onChange={(event) => setBranch(event.currentTarget.value)}
            placeholder="main"
            aria-label="Default branch"
            required
          />
          <button
            type="submit"
            disabled={savingRemote || busy}
            className="inline-flex h-9 items-center justify-center rounded-md bg-bolt-elements-button-primary-background px-3 text-sm font-medium text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover disabled:opacity-60"
          >
            {savingRemote ? 'Saving…' : gitRepositoryUrl ? 'Update' : 'Create'}
          </button>
        </form>
        {gitRepositoryUrl ? (
          <button
            type="button"
            data-testid="git-remote-remove"
            onClick={() => void disconnectRemote()}
            disabled={removingRemote || busy}
            className="justify-self-start text-xs font-medium text-red-500 hover:underline disabled:opacity-60"
          >
            {removingRemote ? 'Removing…' : 'Remove remote'}
          </button>
        ) : null}
      </section>

      {/* .gitignore */}
      <GitIgnoreEditor projectId={projectId} />

      {/* Connections */}
      <section className="grid gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">Connections</h4>
        <div className="grid gap-2">
          {PROVIDERS.map((provider) => {
            const connection = activeByProvider.get(provider.id);
            const connected = Boolean(connection);
            const launchingThis = isLaunching && pendingProvider === provider.id;

            return (
              <div
                key={provider.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={classNames(provider.icon, 'h-4 w-4 text-bolt-elements-item-contentAccent')}
                    aria-hidden
                  />
                  <span className="text-sm font-medium text-bolt-elements-textPrimary">{provider.label}</span>
                  <span
                    className={classNames(
                      'inline-flex items-center gap-1 text-xs',
                      connected ? 'text-bolt-elements-icon-success' : 'text-bolt-elements-textSecondary',
                    )}
                  >
                    <span
                      className={classNames(
                        'h-2 w-2 rounded-full',
                        connected ? 'bg-green-500' : 'bg-bolt-elements-textTertiary',
                      )}
                      aria-hidden
                    />
                    {connectionsLoading
                      ? '…'
                      : connected
                        ? `Active · ${connection!.externalAccountLabel}`
                        : 'Disconnected'}
                  </span>
                </div>
                {connected ? (
                  <button
                    type="button"
                    data-testid={`git-disconnect-${provider.id}`}
                    onClick={() => void disconnect(connection!)}
                    disabled={revoking === connection!.id || busy}
                    className="inline-flex h-8 items-center rounded-md border border-red-500/40 px-3 text-xs font-medium text-red-500 hover:bg-red-500/10 disabled:opacity-60"
                  >
                    {revoking === connection!.id ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid={`git-connect-${provider.id}`}
                    onClick={() => void startOAuth(provider.id)}
                    disabled={launchingThis || (isLaunching && pendingProvider !== null) || busy}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-bolt-elements-item-contentAccent hover:bg-bolt-elements-background-depth-3 disabled:opacity-60"
                  >
                    {launchingThis ? (
                      <>
                        <span className="i-ph:spinner-gap-bold h-3.5 w-3.5 animate-spin" aria-hidden />
                        Waiting…
                      </>
                    ) : (
                      'Sign in'
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Commit author */}
      <section className="grid gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
          Commit author
        </h4>
        <p className="text-xs text-bolt-elements-textSecondary">
          Default author for commits from this project (stored in this browser; used to prefill the commit form). Save
          multiple identities and switch between them per project.
        </p>
        {authorProfiles.length ? (
          <div className="flex flex-wrap gap-2" aria-label="Saved commit author profiles">
            {authorProfiles.map((profile) => {
              const isActive = authorProfileId(authorName, authorEmail) === profile.id;

              return (
                <span
                  key={profile.id}
                  className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                    isActive
                      ? 'border-bolt-elements-focus bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary'
                      : 'border-bolt-elements-borderColor text-bolt-elements-textSecondary'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => applyAuthorProfile(profile)}
                    className="max-w-[14rem] truncate text-start"
                    title={`${profile.name || '(no name)'} <${profile.email || 'no email'}>`}
                  >
                    {profile.name || profile.email}
                    {isActive ? ' ✓' : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAuthorProfile(profile.id)}
                    aria-label={`Remove commit author profile ${profile.name || profile.email}`}
                    className="text-bolt-elements-textTertiary hover:text-bolt-elements-item-contentDanger"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
          <input
            className={inputClass}
            value={authorName}
            onChange={(event) => setAuthorName(event.currentTarget.value)}
            placeholder="Author name"
            aria-label="Default commit author name"
          />
          <input
            className={inputClass}
            type="email"
            value={authorEmail}
            onChange={(event) => setAuthorEmail(event.currentTarget.value)}
            placeholder="author@example.com"
            aria-label="Default commit author email"
          />
          <button
            type="button"
            onClick={saveAuthor}
            className="inline-flex h-9 items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
          >
            Save
          </button>
          <button
            type="button"
            onClick={saveAuthorAsProfile}
            className="inline-flex h-9 items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
          >
            Save as profile
          </button>
        </div>
      </section>
    </div>
  );
}
