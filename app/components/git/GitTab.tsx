import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { GitBranchSyncControls } from '~/components/git/GitBranchSyncControls';
import { GitProviderConnectPanel } from '~/components/git/GitProviderConnectPanel';
import { GitStatusBadge, GitStatusLegend } from '~/components/git/GitStatusBadge';
import { useCurrentWorkspace } from '~/lib/runtime/CurrentWorkspaceContext';
import { classNames } from '~/utils/classNames';

/*
 * The IDE shell wires a CurrentWorkspaceContext from the loader so every tab
 * shares the same workspace selection (resolved from ?workspace= or the project's
 * primary workspace). Git scopes its requests to that workspace — no inline
 * dropdown, no local override.
 */

type GitFileStatus = { path: string; status?: string };
type GitCommit = {
  sha: string;
  shortSha: string;
  parents?: string[];
  author?: string;
  date?: string;
  message: string;
  refs?: string;
};
type GitStash = { id: string; branch?: string; message: string };
type GitBlameLine = { sha: string; line: number; author?: string; content?: string };

type GitData = {
  status?: {
    branch?: string;
    changedFiles?: string[];
    fileStatuses?: GitFileStatus[];
    conflicts?: GitFileStatus[];
    ahead?: number;
    behind?: number;
  };
  branches?: string[];
  commits?: GitCommit[];
  stashes?: GitStash[];
  blame?: GitBlameLine[];
  diff?: string;
};

type GitProject = {
  id: string;
  name?: string;
  gitDefaultBranch?: string | null;
  gitRepositoryUrl?: string | null;
};

type GitWorkspaceSummary = {
  id: string;
  name?: string;
  status?: string;
  runtimeMode?: string;
  createdAt?: string;
};

type GitPanelData = GitData & {
  status?: GitData['status'];
  workspaces?: GitWorkspaceSummary[];
  activeWorkspaceId?: string;
  primaryWorkspaceId?: string;
};

type Envelope = {
  panel?: string;
  status?: 'ok' | 'empty' | 'error';
  project?: GitProject;
  data?: GitPanelData;
  error?: { code: string; message: string; retryable: boolean };
};

interface GitTabProps {
  projectId: string;
}

function timeAgo(value?: string) {
  if (!value) {
    return 'just now';
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return 'recorded';
  }

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  const units: Array<[number, string]> = [
    [60 * 60 * 24 * 365, 'year'],
    [60 * 60 * 24 * 30, 'month'],
    [60 * 60 * 24, 'day'],
    [60 * 60, 'hour'],
    [60, 'minute'],
  ];

  for (const [size, label] of units) {
    const count = Math.floor(seconds / size);

    if (count >= 1) {
      return `${count} ${label}${count === 1 ? '' : 's'} ago`;
    }
  }

  return 'just now';
}

function PanelInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={classNames(
        'h-9 min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 text-sm outline-none focus:border-bolt-elements-focus',
        props.className,
      )}
    />
  );
}

function PanelButton({
  children,
  variant,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'outline' }) {
  return (
    <button
      {...props}
      type={props.type ?? 'submit'}
      className={classNames(
        'inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium disabled:opacity-60',
        variant === 'outline'
          ? 'border border-bolt-elements-borderColor text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3'
          : 'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover',
        props.className,
      )}
    >
      {children}
    </button>
  );
}

export function GitTab({ projectId }: GitTabProps) {
  const { currentWorkspaceId, primaryWorkspaceId: contextPrimaryWorkspaceId } = useCurrentWorkspace();
  const [envelope, setEnvelope] = useState<Envelope | undefined>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [staged, setStaged] = useState<Set<string>>(new Set());
  const [inspectFile, setInspectFile] = useState('');

  const [inspection, setInspection] = useState<{
    loading: boolean;
    blame: GitBlameLine[];
    diff: string;
    error?: string;
  }>({
    loading: false,
    blame: [],
    diff: '',
  });

  const project = envelope?.project;
  const data: GitPanelData = envelope?.data ?? {};
  const status = data.status ?? (data as any);
  const branch = status?.branch ?? project?.gitDefaultBranch ?? 'main';

  const changedFiles: GitFileStatus[] =
    status?.fileStatuses ?? status?.changedFiles?.map((path: string) => ({ path, status: 'M' })) ?? [];

  const conflicts: GitFileStatus[] = status?.conflicts ?? [];
  const branches = data.branches ?? [];
  const commits = data.commits ?? [];
  const stashes = data.stashes ?? [];
  const hasRemote = Boolean(project?.gitRepositoryUrl);
  const workspaces: GitWorkspaceSummary[] = data.workspaces ?? [];
  const activeWorkspaceId = data.activeWorkspaceId;
  const primaryWorkspaceId = contextPrimaryWorkspaceId ?? data.primaryWorkspaceId;
  const resolvedWorkspaceId = currentWorkspaceId ?? activeWorkspaceId;

  const loadPanel = useCallback(
    async (options?: { silent?: boolean; blameFile?: string; diffFile?: string }) => {
      if (!projectId) {
        return;
      }

      if (!options?.silent) {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams();

        if (options?.blameFile) {
          params.set('blameFile', options.blameFile);
        }

        if (options?.diffFile) {
          params.set('diffFile', options.diffFile);
        }

        if (currentWorkspaceId) {
          params.set('workspaceId', currentWorkspaceId);
        }

        const url = `/api/projects/${encodeURIComponent(projectId)}/ide-panel/git${
          params.size > 0 ? `?${params.toString()}` : ''
        }`;

        const response = await fetch(url, { headers: { accept: 'application/json' } });
        const payload = (await response.json()) as Envelope;

        if (!response.ok) {
          throw new Error(payload.error?.message ?? 'Failed to load git panel');
        }

        setEnvelope(payload);

        if (payload.status === 'error' && payload.error) {
          setError(`[${payload.error.code}] ${payload.error.message}`);
        } else {
          setError(undefined);
        }
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Failed to load git panel');
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [projectId, currentWorkspaceId],
  );

  useEffect(() => {
    /*
     * Reset per-file inspection state when the IDE-wide workspace changes; the
     * staged paths/blame/diff belong to the previous workspace's working tree.
     */
    setStaged(new Set());
    setInspectFile('');
    setInspection({ loading: false, blame: [], diff: '' });
  }, [currentWorkspaceId]);

  useEffect(() => {
    void loadPanel();
  }, [loadPanel]);

  const stagedFiles = useMemo(() => Array.from(staged), [staged]);

  const submitAction = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!projectId) {
        return;
      }

      const form = event.currentTarget;
      const formData = new FormData(form);
      const intent = String(formData.get('intent') ?? 'default');

      if (resolvedWorkspaceId) {
        formData.set('workspaceId', resolvedWorkspaceId);
      } else {
        formData.delete('workspaceId');
      }

      setBusy(true);
      setError(undefined);

      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ide-panel/git`, {
          method: 'POST',
          body: formData,
        });

        const result = (await response.json().catch(() => ({}))) as { error?: string };

        if (!response.ok) {
          throw new Error(result.error ?? 'Git action failed');
        }

        form.reset();
        setStaged(new Set());
        toast.success(`Git ${intent.replace(/-/g, ' ')} completed`);
        await loadPanel({ silent: true });
      } catch (requestError) {
        const message = requestError instanceof Error ? requestError.message : 'Git action failed';
        setError(message);
        toast.error(message);
      } finally {
        setBusy(false);
      }
    },
    [loadPanel, projectId, resolvedWorkspaceId],
  );

  const loadInspection = useCallback(
    async (filePath = inspectFile) => {
      if (!filePath || !projectId) {
        return;
      }

      setInspection((current) => ({ ...current, loading: true, error: undefined }));

      try {
        const params = new URLSearchParams({ blameFile: filePath, diffFile: filePath });

        if (resolvedWorkspaceId) {
          params.set('workspaceId', resolvedWorkspaceId);
        }

        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/ide-panel/git?${params.toString()}`,
          { headers: { accept: 'application/json' } },
        );

        if (!response.ok) {
          throw new Error(`Git inspection failed with ${response.status}`);
        }

        const payload = (await response.json()) as Envelope;
        const fileData = payload.data ?? {};

        setInspection({
          loading: false,
          blame: (fileData as any).blame ?? [],
          diff: (fileData as any).diff ?? '',
        });
      } catch (requestError) {
        setInspection({
          loading: false,
          blame: [],
          diff: '',
          error: requestError instanceof Error ? requestError.message : 'Unable to load blame and diff data.',
        });
      }
    },
    [inspectFile, projectId, resolvedWorkspaceId],
  );

  function toggleFile(filePath: string) {
    setStaged((current) => {
      const next = new Set(current);

      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }

      return next;
    });
  }

  if (loading && !envelope) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-bolt-elements-textSecondary">
        Loading workspace git status...
      </div>
    );
  }

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === resolvedWorkspaceId);
  const selectedWorkspaceLabel = selectedWorkspace?.name ?? selectedWorkspace?.id;

  return (
    <div className="h-full overflow-auto">
      <div className="grid gap-4 p-4">
        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
              Workspace repository
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-sm text-bolt-elements-textSecondary">
              <span className="i-ph:terminal-window text-base text-bolt-elements-item-contentAccent" aria-hidden />
              <strong className="truncate text-bolt-elements-textPrimary">
                {selectedWorkspaceLabel ?? 'Project workspace'}
              </strong>
              {selectedWorkspace?.status ? (
                <span className="rounded bg-bolt-elements-background-depth-3 px-2 py-0.5 text-xs uppercase tracking-wide">
                  {selectedWorkspace.status.toLowerCase()}
                </span>
              ) : null}
              {resolvedWorkspaceId && primaryWorkspaceId === resolvedWorkspaceId ? (
                <span className="rounded bg-bolt-elements-background-depth-3 px-2 py-0.5 text-xs uppercase tracking-wide">
                  primary
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-sm text-bolt-elements-textSecondary">
              <span className="i-ph:git-branch text-base text-bolt-elements-item-contentAccent" aria-hidden />
              <strong className="truncate text-bolt-elements-textPrimary">{branch}</strong>
              <span>{status?.ahead ?? 0} ahead</span>
              <span>{status?.behind ?? 0} behind</span>
              <span>{changedFiles.length} changed</span>
              {conflicts.length ? <span className="text-red-500">{conflicts.length} conflicts</span> : null}
            </div>
            {project?.gitRepositoryUrl ? (
              <div className="mt-1 truncate text-xs text-bolt-elements-textSecondary">{project.gitRepositoryUrl}</div>
            ) : null}
          </div>
          <form onSubmit={submitAction} className="flex min-w-[min(220px,100%)] max-w-full gap-2">
            <input name="intent" value="checkout-branch" type="hidden" />
            <label className="sr-only" htmlFor="ide-git-tab-branch-switch">
              Switch branch
            </label>
            <select
              id="ide-git-tab-branch-switch"
              name="branch"
              defaultValue={branch}
              className="h-9 min-w-0 flex-1 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
            >
              {[branch, ...branches.filter((item: string) => item !== branch)].map((item: string) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <PanelButton disabled={busy} variant="outline">
              Switch
            </PanelButton>
          </form>
        </div>

        {!hasRemote && project?.id ? (
          <GitProviderConnectPanel
            projectId={project.id}
            gitRepositoryUrl={project.gitRepositoryUrl}
            defaultBranch={project.gitDefaultBranch}
            workspaceId={resolvedWorkspaceId}
            busy={busy}
            onConnected={() => loadPanel({ silent: true })}
            onRemoteConfigured={() => loadPanel({ silent: true })}
          />
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="grid gap-4">
            <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Working tree</h3>
                  <p className="mt-1 text-xs text-bolt-elements-textSecondary">
                    Files changed in this workspace. Click a file to preview its diff, then stage it for commit.
                  </p>
                </div>
              </div>
              {changedFiles.length ? (
                changedFiles.map((file) => {
                  const path = String(file.path ?? file);

                  return (
                    <label
                      key={path}
                      className="mb-2 flex items-center gap-3 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm last:mb-0"
                    >
                      <input
                        type="checkbox"
                        aria-label={`Stage ${path}`}
                        checked={staged.has(path)}
                        onChange={() => toggleFile(path)}
                      />
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-bolt-elements-textPrimary hover:text-bolt-elements-item-contentAccent"
                        onClick={() => {
                          setInspectFile(path);
                          void loadInspection(path);
                        }}
                      >
                        {path}
                      </button>
                      <GitStatusBadge status={file.status ?? 'M'} />
                      <span className="text-xs font-semibold text-bolt-elements-item-contentAccent">
                        {staged.has(path) ? 'Staged' : 'Stage'}
                      </span>
                    </label>
                  );
                })
              ) : (
                <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4 text-sm text-bolt-elements-textSecondary">
                  No changed files.
                </div>
              )}
              {changedFiles.length ? <GitStatusLegend className="mt-3 bg-bolt-elements-background-depth-1" /> : null}
            </div>

            {conflicts.length > 0 && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4">
                <h3 className="mb-3 text-sm font-semibold text-red-500">Conflict resolution</h3>
                <div className="grid gap-2">
                  {conflicts.map((conflict) => {
                    const path = String(conflict.path ?? conflict);

                    return (
                      <div
                        key={path}
                        className="grid gap-2 rounded-md border border-red-500/30 bg-bolt-elements-background-depth-1 p-3"
                      >
                        <div className="text-sm font-medium text-bolt-elements-textPrimary">{path}</div>
                        <div className="flex flex-wrap gap-2">
                          <form onSubmit={submitAction}>
                            <input name="intent" value="resolve-conflict" type="hidden" />
                            <input name="filePath" value={path} type="hidden" />
                            <input name="strategy" value="ours" type="hidden" />
                            <PanelButton disabled={busy} variant="outline">
                              Keep current
                            </PanelButton>
                          </form>
                          <form onSubmit={submitAction}>
                            <input name="intent" value="resolve-conflict" type="hidden" />
                            <input name="filePath" value={path} type="hidden" />
                            <input name="strategy" value="theirs" type="hidden" />
                            <PanelButton disabled={busy} variant="outline">
                              Keep incoming
                            </PanelButton>
                          </form>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
              <h3 className="mb-3 text-sm font-semibold text-bolt-elements-textPrimary">Commit graph</h3>
              {commits.length ? (
                <div className="grid gap-2">
                  {commits.map((commit, index) => (
                    <div
                      key={commit.sha}
                      className="grid grid-cols-[20px_76px_minmax(0,1fr)] gap-3 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm"
                    >
                      <div className="relative flex justify-center">
                        <span className="mt-1 h-2.5 w-2.5 rounded-full bg-bolt-elements-item-contentAccent" />
                        {index < commits.length - 1 && (
                          <span className="absolute top-4 h-8 w-px bg-bolt-elements-borderColor" />
                        )}
                      </div>
                      <code className="text-xs text-bolt-elements-textSecondary">{commit.shortSha}</code>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-bolt-elements-textPrimary">{commit.message}</div>
                        <div className="truncate text-xs text-bolt-elements-textSecondary">
                          {timeAgo(commit.date)} {commit.refs ? `- ${commit.refs}` : ''}
                          {commit.author ? ` - ${commit.author}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4 text-sm text-bolt-elements-textSecondary">
                  No commits yet. Make your first commit.
                </div>
              )}
            </div>

            <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
              <div className="mb-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                <label className="grid gap-1 text-xs font-medium text-bolt-elements-textSecondary">
                  Blame and diff file
                  <PanelInput
                    value={inspectFile}
                    onChange={(event) => setInspectFile(event.target.value)}
                    placeholder="src/App.tsx"
                  />
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    className="inline-flex h-9 items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 disabled:opacity-60"
                    onClick={() => void loadInspection()}
                    disabled={!inspectFile || inspection.loading}
                  >
                    {inspection.loading ? 'Loading...' : 'Load blame'}
                  </button>
                </div>
              </div>
              {inspection.error && (
                <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
                  {inspection.error}
                </div>
              )}
              {inspection.diff ? (
                <pre className="mb-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3 text-xs text-bolt-elements-textPrimary">
                  {inspection.diff}
                </pre>
              ) : null}
              {inspection.blame.length ? (
                <div className="max-h-64 overflow-auto rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
                  {inspection.blame.slice(0, 80).map((line) => (
                    <div
                      key={`${line.sha}-${line.line}`}
                      className="grid grid-cols-[48px_92px_110px_minmax(0,1fr)] gap-2 border-b border-bolt-elements-borderColor px-3 py-1.5 text-xs last:border-b-0"
                    >
                      <span className="text-bolt-elements-textSecondary">{line.line}</span>
                      <code className="truncate text-bolt-elements-textSecondary">{String(line.sha).slice(0, 8)}</code>
                      <span className="truncate text-bolt-elements-textSecondary">{line.author}</span>
                      <code className="truncate text-bolt-elements-textPrimary">{line.content}</code>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4 text-sm text-bolt-elements-textSecondary">
                  Select a changed file or enter a path to load inline blame.
                </div>
              )}
            </div>
          </section>

          <aside className="grid content-start gap-3">
            <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
              <h3 className="mb-3 text-sm font-semibold text-bolt-elements-textPrimary">Staged</h3>
              {stagedFiles.length ? (
                <div className="overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
                  {stagedFiles.map((file) => (
                    <div
                      key={file}
                      className="border-b border-bolt-elements-borderColor px-3 py-2 text-xs text-bolt-elements-textPrimary last:border-b-0"
                    >
                      <div className="truncate font-medium">{file}</div>
                      <div className="text-bolt-elements-textSecondary">Ready for commit</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3 text-sm text-bolt-elements-textSecondary">
                  Select files above to stage changes.
                </div>
              )}
            </div>

            <form
              onSubmit={submitAction}
              className="grid gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
            >
              <input name="intent" value="commit" type="hidden" />
              <input name="stagedFiles" value={stagedFiles.join(',')} type="hidden" />
              <label className="grid gap-1 text-xs font-medium text-bolt-elements-textSecondary">
                Commit message
                <textarea
                  name="message"
                  className="min-h-24 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-2 text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
                  placeholder={stagedFiles.length ? `Commit ${stagedFiles.length} staged files` : 'Commit message'}
                />
              </label>
              <PanelButton disabled={busy || stagedFiles.length === 0}>Commit changes</PanelButton>
            </form>

            <GitBranchSyncControls branch={branch} busy={busy} idPrefix="git-tab" onSubmit={submitAction} />

            <details className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-bolt-elements-textPrimary">
                Branch actions
              </summary>
              <div className="mt-3 grid gap-3">
                <form onSubmit={submitAction} className="grid gap-2">
                  <input name="intent" value="create-branch" type="hidden" />
                  <label className="text-xs font-medium text-bolt-elements-textSecondary" htmlFor="git-tab-new-branch">
                    Create branch
                  </label>
                  <PanelInput id="git-tab-new-branch" name="branch" placeholder="feature/billing-flow" required />
                  <PanelInput name="startPoint" defaultValue={branch} aria-label="Start point" />
                  <PanelButton disabled={busy} variant="outline">
                    Create and switch
                  </PanelButton>
                </form>

                <form onSubmit={submitAction} className="grid gap-2">
                  <input name="intent" value="stash" type="hidden" />
                  <label
                    className="text-xs font-medium text-bolt-elements-textSecondary"
                    htmlFor="git-tab-stash-message"
                  >
                    Stash message
                  </label>
                  <PanelInput id="git-tab-stash-message" name="message" placeholder="WIP before rebase" />
                  <PanelButton disabled={busy || changedFiles.length === 0} variant="outline">
                    Stash changes
                  </PanelButton>
                </form>
              </div>
            </details>

            {stashes.length ? (
              <div className="grid gap-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
                <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Stashes</h3>
                {stashes.map((stash) => (
                  <div
                    key={stash.id}
                    className="grid gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-2"
                  >
                    <div className="text-xs font-semibold text-bolt-elements-textPrimary">{stash.id}</div>
                    <div className="text-xs text-bolt-elements-textSecondary">{stash.message}</div>
                    <div className="flex gap-2">
                      <form onSubmit={submitAction}>
                        <input name="intent" value="apply-stash" type="hidden" />
                        <input name="stashRef" value={stash.id} type="hidden" />
                        <PanelButton disabled={busy} variant="outline">
                          Apply
                        </PanelButton>
                      </form>
                      <form onSubmit={submitAction}>
                        <input name="intent" value="pop-stash" type="hidden" />
                        <input name="stashRef" value={stash.id} type="hidden" />
                        <PanelButton disabled={busy} variant="outline">
                          Pop
                        </PanelButton>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <form
              onSubmit={submitAction}
              className="grid gap-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
            >
              <input name="intent" value="cherry-pick" type="hidden" />
              <label className="text-xs font-medium text-bolt-elements-textSecondary" htmlFor="git-tab-cherry-pick">
                Cherry-pick SHA
              </label>
              <PanelInput id="git-tab-cherry-pick" name="sha" placeholder="abc1234" required />
              <PanelButton disabled={busy} variant="outline">
                Cherry-pick
              </PanelButton>
            </form>

            <form
              onSubmit={submitAction}
              className="grid gap-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
            >
              <input name="intent" value="pr" type="hidden" />
              <label className="text-xs font-medium text-bolt-elements-textSecondary" htmlFor="git-tab-pr-title">
                Pull request title
              </label>
              <PanelInput id="git-tab-pr-title" name="title" placeholder="Project update" />
              <div className="grid grid-cols-2 gap-2">
                <PanelInput name="sourceBranch" defaultValue={branch} aria-label="Source branch" />
                <PanelInput
                  name="targetBranch"
                  defaultValue={project?.gitDefaultBranch ?? 'main'}
                  aria-label="Target branch"
                />
              </div>
              <textarea
                name="body"
                className="min-h-20 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-2 text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
                placeholder="Summary, tests, rollout notes"
                aria-label="Pull request description"
              />
              <PanelButton disabled={busy || !hasRemote} variant="outline">
                Create GitHub PR
              </PanelButton>
              {!hasRemote && (
                <p className="text-xs text-bolt-elements-textSecondary">
                  Configure a GitHub remote before creating a pull request.
                </p>
              )}
            </form>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default GitTab;
