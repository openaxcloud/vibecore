import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { isSshRemoteUrl, sshHostFromGitUrl } from '~/components/git/git-ssh-url';
import { useConnectorPopup } from '~/lib/chat/use-connector-popup';
import {
  formatGitSettingsCopy,
  getGitSettingsCopy,
  getGitSettingsErrorMessage,
  type GitSettingsCopy,
} from '~/lib/i18n/catalogs/git-settings';
import { classNames } from '~/utils/classNames';

/*
 * Replit-parity Git Settings sub-pane (opened by the ⚙ in the Git pane header).
 * Vertical sections — Remote · .gitignore · Connections · SSH keys · Commit
 * author — and it stays reachable even after a remote is configured (unlike the
 * connect-only panel, which hides once connected). Connections shows live
 * per-provider status with Sign in / Disconnect, reading + revoking through
 * /api/git/connections. SSH keys generate/copy/test/delete the project's git SSH
 * key, which lives only in the isolated workspace pod (push/pull over SSH).
 */
type OAuthProviderId = 'github' | 'gitlab' | 'bitbucket';

type Connection = {
  id: string;
  provider: string;
  externalAccountLabel: string;
  status: string;
  revokedAt: string | null;
};

const PROVIDERS: Array<{ id: OAuthProviderId; icon: string }> = [
  { id: 'github', icon: 'i-ph:github-logo' },
  { id: 'gitlab', icon: 'i-ph:gitlab-logo' },
  { id: 'bitbucket', icon: 'i-ph:git-branch' },
];

function providerLabel(copy: GitSettingsCopy, provider: string) {
  const key = `gitSettings.provider.${provider}` as const;

  return key in copy ? copy[key as keyof GitSettingsCopy] : provider;
}

/*
 * .gitignore editor — loads the project's .gitignore from the running workspace
 * (GET /api/projects/:id/files/.gitignore, empty when absent) and saves edits
 * back (POST { content }). Real file IO, no mock.
 */
function GitIgnoreEditor({ projectId }: { projectId: string }) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const copy = getGitSettingsCopy(language);
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
      setStatus(response.ok ? copy['gitSettings.gitignore.saved'] : copy['gitSettings.gitignore.saveFailed']);
    } catch {
      setStatus(copy['gitSettings.gitignore.saveFailed']);
    } finally {
      setSaving(false);
    }
  }, [content, copy, url]);

  return (
    <section className="grid gap-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
        {copy['gitSettings.gitignore.title']}
      </h4>
      <textarea
        value={content}
        onChange={(event) => setContent(event.currentTarget.value)}
        disabled={loading}
        rows={6}
        spellCheck={false}
        aria-label={copy['gitSettings.gitignore.contents']}
        placeholder={loading ? copy['gitSettings.gitignore.loading'] : 'node_modules\n.env\ndist'}
        className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1.5 font-mono text-xs outline-none focus:border-bolt-elements-focus"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || loading}
          className="inline-flex h-8 items-center justify-center rounded-md bg-bolt-elements-button-primary-background px-3 text-sm font-medium text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover disabled:opacity-60"
        >
          {saving ? copy['gitSettings.gitignore.saving'] : copy['gitSettings.gitignore.save']}
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

type SshKeyConnection = {
  id: string;
  name?: string;
  host?: string;
  username?: string;
  publicKey?: string;
  fingerprint?: string;
  keyType?: 'ed25519' | 'rsa';
  lastCheckedAt?: string;
  lastError?: string;
};

/*
 * Replit-parity SSH keys for git (Option A). The private key lives only as this
 * project's secret, injected into its OWN isolated workspace pod — push/pull over
 * SSH run THERE with it, never on shared infra. Shares the same key store as
 * Terminal → SSH, so a key generated here also works there. Reuses the terminal
 * panel intents (generate-keypair / delete-ssh / git-ssh) — no extra backend.
 */
function SshKeysSection({
  projectId,
  gitRepositoryUrl,
  workspaceId,
  busy,
}: {
  projectId: string;
  gitRepositoryUrl?: string | null;
  workspaceId?: string;
  busy?: boolean;
}) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const copy = getGitSettingsCopy(language);

  const text = useCallback(
    (template: string, values: Readonly<Record<string, string | number>> = {}) =>
      formatGitSettingsCopy(template, values),
    [],
  );

  const [keys, setKeys] = useState<SshKeyConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);

  const terminalUrl = useMemo(() => `/api/projects/${encodeURIComponent(projectId)}/ide-panel/terminal`, [projectId]);

  const originIsSsh = useMemo(() => isSshRemoteUrl(gitRepositoryUrl ?? ''), [gitRepositoryUrl]);
  const originHost = useMemo(() => sshHostFromGitUrl(gitRepositoryUrl ?? ''), [gitRepositoryUrl]);

  /*
   * Same safe default as the server's selectSshConnectionForOrigin: the key whose
   * host matches the origin, else the single key when there's exactly one.
   */
  const boundKeyId = useMemo(() => {
    if (originHost) {
      const match = keys.find((key) => (key.host ?? '').trim().toLowerCase() === originHost);

      if (match) {
        return match.id;
      }
    }

    return keys.length === 1 ? keys[0].id : null;
  }, [keys, originHost]);

  const readKeys = useCallback(async () => {
    const response = await fetch(terminalUrl, { headers: { accept: 'application/json' } });

    const payload = (await response.json().catch(() => ({}))) as {
      data?: { terminalState?: { sshConnections?: SshKeyConnection[] } };
    };

    const list = payload?.data?.terminalState?.sshConnections;

    return Array.isArray(list) ? list : [];
  }, [terminalUrl]);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      setKeys(await readKeys());
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, [readKeys]);

  useEffect(() => {
    void load();
  }, [load]);

  const postIntent = useCallback(
    async (fields: Record<string, string>) => {
      const form = new FormData();

      for (const [key, value] of Object.entries(fields)) {
        form.set(key, value);
      }

      if (workspaceId) {
        form.set('workspaceId', workspaceId);
      }

      const response = await fetch(terminalUrl, { method: 'POST', body: form });
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? text(copy['gitSettings.ssh.requestFailed'], { status: response.status }));
      }

      return payload;
    },
    [copy, terminalUrl, text, workspaceId],
  );

  const generate = useCallback(async () => {
    setGenerating(true);

    try {
      const host = originHost ?? '';

      const payload = await postIntent({
        intent: 'generate-keypair',
        type: 'ed25519',
        host,
        username: 'git',
        name: host ? `Git · ${host}` : copy['gitSettings.ssh.defaultName'],
      });
      setRevealedId(String(payload.connectionId ?? ''));
      toast.success(copy['gitSettings.ssh.generated']);
      await load();
    } catch (error) {
      toast.error(getGitSettingsErrorMessage(language, error, copy['gitSettings.ssh.generateFailed']));
    } finally {
      setGenerating(false);
    }
  }, [copy, language, load, originHost, postIntent]);

  const removeKey = useCallback(
    async (id: string) => {
      setBusyKeyId(id);

      try {
        await postIntent({ intent: 'delete-ssh', connectionId: id });

        if (revealedId === id) {
          setRevealedId(null);
        }

        toast.success(copy['gitSettings.ssh.deleted']);
        await load();
      } catch (error) {
        toast.error(getGitSettingsErrorMessage(language, error, copy['gitSettings.ssh.deleteFailed']));
      } finally {
        setBusyKeyId(null);
      }
    },
    [copy, language, load, postIntent, revealedId],
  );

  const testAccess = useCallback(
    async (id: string) => {
      const remote = (gitRepositoryUrl ?? '').trim();

      if (!remote || !originIsSsh) {
        toast.error(copy['gitSettings.ssh.remoteRequired']);

        return;
      }

      setBusyKeyId(id);

      try {
        /*
         * git-ssh runs a real `git ls-remote` in the workspace pod and records the
         * outcome on the connection (lastError) rather than failing the request, so
         * re-read the list and inspect this key to report pass/fail.
         */
        await postIntent({ intent: 'git-ssh', connectionId: id, repoUrl: remote });

        const list = await readKeys();
        setKeys(list);

        if (list.find((key) => key.id === id)?.lastError) {
          toast.error(copy['gitSettings.ssh.accessFailed']);
        } else {
          toast.success(text(copy['gitSettings.ssh.accessOk'], { host: originHost ?? 'origin' }));
        }
      } catch (error) {
        toast.error(getGitSettingsErrorMessage(language, error, copy['gitSettings.ssh.testFailed']));
      } finally {
        setBusyKeyId(null);
      }
    },
    [copy, gitRepositoryUrl, language, originHost, originIsSsh, postIntent, readKeys, text],
  );

  const copyPublicKey = useCallback(
    async (id: string, publicKey?: string) => {
      if (!publicKey || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        toast.error(copy['gitSettings.ssh.publicKeyUnavailable']);

        return;
      }

      try {
        await navigator.clipboard.writeText(publicKey);
        setCopiedId(id);
        setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
      } catch {
        toast.error(copy['gitSettings.ssh.copyFailed']);
      }
    },
    [copy],
  );

  const secondaryButton =
    'inline-flex h-8 items-center rounded-md border border-bolt-elements-borderColor px-2.5 text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 disabled:opacity-60';

  return (
    <section className="grid gap-2" data-testid="git-ssh-keys">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
        {copy['gitSettings.ssh.title']}
      </h4>
      <p className="text-xs text-bolt-elements-textSecondary">{copy['gitSettings.ssh.description']}</p>

      {originIsSsh ? (
        <p className="text-xs text-bolt-elements-textTertiary">
          {copy['gitSettings.ssh.originHost']}{' '}
          <span className="font-mono text-bolt-elements-textSecondary">{originHost ?? '—'}</span> ·{' '}
          {boundKeyId ? (
            <span className="text-bolt-elements-icon-success">{copy['gitSettings.ssh.bound']}</span>
          ) : (
            <span className="text-bolt-elements-item-contentDanger">{copy['gitSettings.ssh.unbound']}</span>
          )}
        </p>
      ) : (
        <p className="text-xs text-bolt-elements-textTertiary">
          {text(copy['gitSettings.ssh.remoteHint'], { example: 'git@github.com:org/repo.git' })}
        </p>
      )}

      <div className="grid gap-2">
        {loading ? (
          <span className="text-xs text-bolt-elements-textTertiary">{copy['gitSettings.ssh.loading']}</span>
        ) : keys.length === 0 ? (
          <span className="text-xs text-bolt-elements-textTertiary">{copy['gitSettings.ssh.empty']}</span>
        ) : (
          keys.map((key) => {
            const bound = boundKeyId === key.id;

            return (
              <div
                key={key.id}
                className="grid gap-1.5 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="i-ph:key h-4 w-4 text-bolt-elements-item-contentAccent" aria-hidden />
                    <span className="truncate text-sm font-medium text-bolt-elements-textPrimary">
                      {key.name || key.host || copy['gitSettings.ssh.keyFallback']}
                    </span>
                    {key.keyType ? (
                      <span className="rounded-full border border-bolt-elements-borderColor px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-bolt-elements-textTertiary">
                        {key.keyType}
                      </span>
                    ) : null}
                    {bound ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-bolt-elements-icon-success">
                        <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden />
                        {copy['gitSettings.ssh.boundToOrigin']}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {key.publicKey ? (
                      <button
                        type="button"
                        onClick={() => void copyPublicKey(key.id, key.publicKey)}
                        disabled={busy}
                        className={secondaryButton}
                      >
                        {copiedId === key.id ? copy['gitSettings.ssh.copied'] : copy['gitSettings.ssh.copyPublic']}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void testAccess(key.id)}
                      disabled={busy || busyKeyId === key.id}
                      className={secondaryButton}
                    >
                      {busyKeyId === key.id ? copy['gitSettings.ssh.testing'] : copy['gitSettings.ssh.test']}
                    </button>
                    <button
                      type="button"
                      data-testid={`git-ssh-key-delete-${key.id}`}
                      onClick={() => void removeKey(key.id)}
                      disabled={busy || busyKeyId === key.id}
                      className="inline-flex h-8 items-center rounded-md border border-red-500/40 px-2.5 text-xs font-medium text-red-500 hover:bg-red-500/10 disabled:opacity-60"
                    >
                      {copy['gitSettings.ssh.delete']}
                    </button>
                  </div>
                </div>
                {key.fingerprint ? (
                  <code className="truncate text-[11px] text-bolt-elements-textTertiary" title={key.fingerprint}>
                    {key.fingerprint}
                  </code>
                ) : null}
                {key.lastError ? (
                  <span className="text-[11px] text-red-500">{copy['gitSettings.ssh.lastTestFailed']}</span>
                ) : null}
                {revealedId === key.id && key.publicKey ? (
                  <div className="grid gap-1 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2">
                    <span className="text-[11px] text-bolt-elements-textSecondary">
                      {copy['gitSettings.ssh.installPublicKey']}
                    </span>
                    <code className="block max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-bolt-elements-textPrimary">
                      {key.publicKey}
                    </code>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="git-ssh-key-generate"
          onClick={() => void generate()}
          disabled={generating || busy}
          className="inline-flex h-9 items-center justify-center rounded-md bg-bolt-elements-button-primary-background px-3 text-sm font-medium text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover disabled:opacity-60"
        >
          {generating ? copy['gitSettings.ssh.generating'] : copy['gitSettings.ssh.generate']}
        </button>
        <span className="text-xs text-bolt-elements-textTertiary">{copy['gitSettings.ssh.storage']}</span>
      </div>
    </section>
  );
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
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const copy = getGitSettingsCopy(language);

  const text = useCallback(
    (template: string, values: Readonly<Record<string, string | number>> = {}) =>
      formatGitSettingsCopy(template, values),
    [],
  );

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
      toast.success(text(copy['gitSettings.toast.authorSelected'], { author: profile.name || profile.email }));
    },
    [copy, setActiveAuthor, text],
  );

  const saveAuthorAsProfile = useCallback(() => {
    const name = authorName.trim();
    const email = authorEmail.trim();

    if (!name && !email) {
      toast.error(copy['gitSettings.toast.authorRequired']);
      return;
    }

    const id = authorProfileId(name, email);
    const next = [{ id, name, email }, ...authorProfiles.filter((entry) => entry.id !== id)].slice(0, 12);
    persistAuthorProfiles(next);
    setActiveAuthor(name, email);
    toast.success(copy['gitSettings.toast.profileSaved']);
  }, [authorEmail, authorName, authorProfiles, copy, persistAuthorProfiles, setActiveAuthor]);

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
    toast.success(
      text(copy['gitSettings.toast.providerConnected'], {
        provider: providerLabel(copy, state.result.provider),
        account: state.result.accountLabel,
      }),
    );
    setPendingProvider(null);
    void loadConnections();
  }, [copy, loadConnections, state, text]);

  useEffect(() => {
    if (state.phase === 'failed') {
      setPendingProvider(null);

      const fallback = text(copy['gitSettings.toast.providerConnectionFailed'], {
        provider: providerLabel(copy, state.result.provider),
      });
      toast.error(language.toLowerCase().startsWith('fr') ? fallback : (state.result.errorMessage ?? fallback));
    }
  }, [copy, language, state, text]);

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
          throw new Error(
            parsed.error ??
              text(copy['gitSettings.toast.oauthStartFailed'], {
                provider: providerLabel(copy, provider),
                status: response.status,
              }),
          );
        }

        const result = (await response.json()) as { provider: string; authorizationUrl: string };
        launch({ authorizationUrl: result.authorizationUrl, provider: result.provider });
      } catch (error) {
        setPendingProvider(null);
        toast.error(getGitSettingsErrorMessage(language, error, copy['gitSettings.toast.oauthUnavailable']));
      }
    },
    [copy, language, launch, projectId, reset, text],
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
          throw new Error(
            parsed.error ?? text(copy['gitSettings.toast.disconnectFailed'], { status: response.status }),
          );
        }

        toast.success(
          text(copy['gitSettings.toast.providerDisconnected'], {
            provider: providerLabel(copy, connection.provider),
          }),
        );
        await loadConnections();
      } catch (error) {
        toast.error(getGitSettingsErrorMessage(language, error, copy['gitSettings.toast.disconnectUnavailable']));
      } finally {
        setRevoking(null);
      }
    },
    [copy, language, loadConnections, text],
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
          throw new Error(
            parsed.error ?? text(copy['gitSettings.toast.remoteSaveFailed'], { status: response.status }),
          );
        }

        toast.success(copy['gitSettings.toast.remoteSaved']);
        void onRemoteConfigured?.();
      } catch (error) {
        toast.error(getGitSettingsErrorMessage(language, error, copy['gitSettings.toast.remoteSaveUnavailable']));
      } finally {
        setSavingRemote(false);
      }
    },
    [branch, copy, language, onRemoteConfigured, projectId, remoteUrl, text, workspaceId],
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
        throw new Error(
          parsed.error ?? text(copy['gitSettings.toast.remoteRemoveFailed'], { status: response.status }),
        );
      }

      setRemoteUrl('');
      toast.success(copy['gitSettings.toast.remoteRemoved']);
      void onRemoteConfigured?.();
    } catch (error) {
      toast.error(getGitSettingsErrorMessage(language, error, copy['gitSettings.toast.remoteRemoveUnavailable']));
    } finally {
      setRemovingRemote(false);
    }
  }, [copy, language, onRemoteConfigured, projectId, text, workspaceId]);

  const saveAuthor = useCallback(() => {
    setActiveAuthor(authorName.trim(), authorEmail.trim());
    toast.success(copy['gitSettings.toast.defaultAuthorSaved']);
  }, [authorEmail, authorName, copy, setActiveAuthor]);

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
      aria-label={copy['gitSettings.panel.label']}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-bolt-elements-textPrimary">
          <span className="i-ph:gear text-base text-bolt-elements-item-contentAccent" aria-hidden />
          {copy['gitSettings.panel.title']}
        </h3>
        <button
          type="button"
          data-testid="git-settings-close"
          onClick={onClose}
          className="rounded-md border border-bolt-elements-borderColor px-2 py-1 text-xs text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3"
        >
          {copy['gitSettings.panel.done']}
        </button>
      </div>

      {/* Remote */}
      <section className="grid gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
          {copy['gitSettings.remote.title']}
        </h4>
        <form onSubmit={saveRemote} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px_auto]">
          <input
            className={inputClass}
            value={remoteUrl}
            onChange={(event) => setRemoteUrl(event.currentTarget.value)}
            placeholder="https://github.com/org/repo.git"
            aria-label={copy['gitSettings.remote.urlLabel']}
            required
          />
          <input
            className={inputClass}
            value={branch}
            onChange={(event) => setBranch(event.currentTarget.value)}
            placeholder={copy['gitSettings.remote.branchPlaceholder']}
            aria-label={copy['gitSettings.remote.branchLabel']}
            required
          />
          <button
            type="submit"
            disabled={savingRemote || busy}
            className="inline-flex h-9 items-center justify-center rounded-md bg-bolt-elements-button-primary-background px-3 text-sm font-medium text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover disabled:opacity-60"
          >
            {savingRemote
              ? copy['gitSettings.remote.saving']
              : gitRepositoryUrl
                ? copy['gitSettings.remote.update']
                : copy['gitSettings.remote.create']}
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
            {removingRemote ? copy['gitSettings.remote.removing'] : copy['gitSettings.remote.remove']}
          </button>
        ) : null}
      </section>

      {/* .gitignore */}
      <GitIgnoreEditor projectId={projectId} />

      {/* Connections */}
      <section className="grid gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
          {copy['gitSettings.connections.title']}
        </h4>
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
                  <span className="text-sm font-medium text-bolt-elements-textPrimary">
                    {providerLabel(copy, provider.id)}
                  </span>
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
                        ? text(copy['gitSettings.connections.active'], {
                            account: connection!.externalAccountLabel,
                          })
                        : copy['gitSettings.connections.disconnected']}
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
                    {revoking === connection!.id
                      ? copy['gitSettings.connections.disconnecting']
                      : copy['gitSettings.connections.disconnect']}
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
                        {copy['gitSettings.connections.waiting']}
                      </>
                    ) : (
                      copy['gitSettings.connections.signIn']
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* SSH keys */}
      <SshKeysSection projectId={projectId} gitRepositoryUrl={gitRepositoryUrl} workspaceId={workspaceId} busy={busy} />

      {/* Commit author */}
      <section className="grid gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
          {copy['gitSettings.author.title']}
        </h4>
        <p className="text-xs text-bolt-elements-textSecondary">{copy['gitSettings.author.description']}</p>
        {authorProfiles.length ? (
          <div className="flex flex-wrap gap-2" aria-label={copy['gitSettings.author.savedProfiles']}>
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
                    title={`${profile.name || copy['gitSettings.author.noName']} <${
                      profile.email || copy['gitSettings.author.noEmail']
                    }>`}
                  >
                    {profile.name || profile.email}
                    {isActive ? ' ✓' : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAuthorProfile(profile.id)}
                    aria-label={text(copy['gitSettings.author.removeProfile'], {
                      author: profile.name || profile.email,
                    })}
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
            placeholder={copy['gitSettings.author.namePlaceholder']}
            aria-label={copy['gitSettings.author.nameLabel']}
          />
          <input
            className={inputClass}
            type="email"
            value={authorEmail}
            onChange={(event) => setAuthorEmail(event.currentTarget.value)}
            placeholder={copy['gitSettings.author.emailPlaceholder']}
            aria-label={copy['gitSettings.author.emailLabel']}
          />
          <button
            type="button"
            onClick={saveAuthor}
            className="inline-flex h-9 items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
          >
            {copy['gitSettings.author.save']}
          </button>
          <button
            type="button"
            onClick={saveAuthorAsProfile}
            className="inline-flex h-9 items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
          >
            {copy['gitSettings.author.saveProfile']}
          </button>
        </div>
      </section>
    </div>
  );
}
