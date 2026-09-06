import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import {
  computeWorkspaceFilesSignature,
  shouldAdvanceLastFetched,
  shouldApplyEnvelopeForLoad,
  shouldSurfaceLoadError,
  shouldRefreshOnFilesChange,
  shouldRefreshOnVisibility,
} from './git-autorefresh';
import {
  failedConflictContentState,
  resolveConflictContentState,
  type MergeContentState,
} from './git-conflict-content';
import { findUnserializableStagedFiles, pathBreaksCommaSerialization } from './git-staged-files';
import { GitBranchSyncControls } from '~/components/git/GitBranchSyncControls';
import { GitDiffView } from '~/components/git/GitDiffView';
import { GitMergeEditor } from '~/components/git/GitMergeEditor';
import { GitProviderConnectPanel } from '~/components/git/GitProviderConnectPanel';
import { GitSettingsPanel } from '~/components/git/GitSettingsPanel';
import { GitStatusBadge, GitStatusLegend } from '~/components/git/GitStatusBadge';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { formatClientAstResidualCopy, getClientAstResidualCopy } from '~/lib/i18n/catalogs/client-ast-residual';
import { useCurrentWorkspace } from '~/lib/runtime/CurrentWorkspaceContext';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { debounce } from '~/utils/debounce';

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

    /** True when HEAD is detached; `branch` then carries the short commit SHA. */
    detached?: boolean;
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

  /*
   * Soft-degraded marker: set by the ide-panel loader when the git status call
   * transiently 5xx/locks (the response still renders with an empty status). Its
   * presence means the accompanying `status`/`changedFiles` are a placeholder, not
   * a real empty tree — the UI must not treat it as "no changes".
   */
  gitLoadError?: string;
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

type Translate = (key: string, options?: Record<string, unknown>) => string;

function timeAgo(value: string | undefined, language: string, t: Translate) {
  if (!value) {
    return t('idePanels.git.justNow');
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return t('idePanels.git.recorded');
  }

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  const units: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60 * 60 * 24 * 365, 'year'],
    [60 * 60 * 24 * 30, 'month'],
    [60 * 60 * 24, 'day'],
    [60 * 60, 'hour'],
    [60, 'minute'],
  ];

  const formatter = new Intl.RelativeTimeFormat(language.startsWith('fr') ? 'fr-FR' : 'en', { numeric: 'always' });

  for (const [size, label] of units) {
    const count = Math.floor(seconds / size);

    if (count >= 1) {
      return formatter.format(-count, label);
    }
  }

  return t('idePanels.git.justNow');
}

function PanelInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={classNames(
        'h-[34px] min-w-0 rounded-[6px] border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 text-[13px] outline-none focus:border-bolt-elements-focus',
        props.className,
      )}
    />
  );
}

/*
 * The `accent` variant exists because "Commit changes" used to be the default
 * variant repainted from the outside — `style={{ background: accent }}` plus a
 * `text-white` in `className`. The base already sets
 * `text-bolt-elements-button-primary-text` (the action blue), and which of two
 * competing colour utilities wins is decided by their order in the generated
 * stylesheet, not by the order of the class attribute. The blue won: measured
 * live in the Git panel, the label sat at 1.07:1 in dark and 1.54:1 in light on
 * the orange fill. Carrying background and foreground together in one variant
 * removes the conflict instead of racing it.
 */
/*
 * La variante `accent` prend son fond ET son encre dans la MÊME paire de
 * jetons. Poser `text-white` sur `--ecode-accent` (#f26207) donnait 3,22:1 :
 * le correctif de BUG-THEME-006 avait bien chassé le bleu sur l'orange
 * (1,07:1) mais l'avait remplacé par du blanc sur le MÊME orange, qui ne passe
 * pas davantage. Cet aplat NE BASCULE PAS et reste sous AA dans les DEUX
 * thèmes — c'est le constat de BUG-THEME-011, où le blanc y plafonne à 2,62:1.
 * La paire sanctionnée, elle, bascule : #ffffff sur #c2410c = 5,18:1 en clair,
 * #111827 sur #f97316 = 6,33:1 en sombre.
 * Épinglé par `app/styles/on-accent-ink.spec.ts` ET
 * `app/styles/on-accent-white.spec.ts`.
 */
function PanelButton({
  children,
  variant,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'outline' | 'accent' }) {
  return (
    <button
      {...props}
      type={props.type ?? 'submit'}
      className={classNames(
        'inline-flex h-[32px] items-center justify-center rounded-[6px] px-3 text-[13.3px] font-medium disabled:opacity-60',
        variant === 'outline' &&
          'border border-bolt-elements-borderColor text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3',
        variant === 'accent' &&
          'bg-[var(--vc-action-primary)] font-semibold text-[var(--vc-action-primary-foreground)] hover:opacity-90',
        !variant &&
          'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover',
        props.className,
      )}
    >
      {children}
    </button>
  );
}

/*
 * Searchable branch selector (Replit-style): current branch as the trigger,
 * a filter input + branch list in the popover, and an inline "New branch"
 * creator (create + checkout in one step). Every action hits the real
 * checkout endpoint via the callbacks — no local-only state. When HEAD is
 * detached the trigger renders in the warning tokens and creating a branch
 * starts from the current commit (git checkout -b default).
 */
function GitBranchDropdown({
  branch,
  branches,
  detached,
  busy,
  onCheckout,
  onCreate,
}: {
  branch: string;
  branches: string[];
  detached: boolean;
  busy: boolean;
  onCheckout: (branch: string) => void;
  onCreate: (branch: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const astCopy = getClientAstResidualCopy(i18n.resolvedLanguage ?? i18n.language);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [newBranch, setNewBranch] = useState('');

  // A detached SHA is not a branch — never list it as one.
  const allBranches = detached || branches.includes(branch) ? branches : [branch, ...branches];
  const filtered = allBranches.filter((item) => item.toLowerCase().includes(query.trim().toLowerCase()));

  const submitCreate = () => {
    const name = newBranch.trim();

    if (!name) {
      return;
    }

    setOpen(false);
    onCreate(name);
  };

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);

        if (!next) {
          setQuery('');
          setNewBranch('');
        }
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          data-testid="git-branch-dropdown-trigger"
          disabled={busy}
          aria-label={
            detached
              ? t('idePanels.git.branchTriggerDetached', { branch })
              : t('idePanels.git.branchTriggerCurrent', { branch })
          }
          className="inline-flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 focus:border-bolt-elements-focus focus:outline-none disabled:opacity-60"
          style={detached ? { color: 'var(--status-warning-text)' } : undefined}
        >
          <span
            className={classNames(
              'shrink-0 text-base',
              detached ? 'i-ph:warning' : 'i-ph:git-branch text-bolt-elements-item-contentAccent',
            )}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-left font-medium">
            {detached ? formatClientAstResidualCopy(astCopy['clientAst.git.detachedHead'], { branch }) : branch}
          </span>
          <span className="i-ph:caret-down shrink-0 text-xs text-bolt-elements-textSecondary" aria-hidden />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="end"
          sideOffset={6}
          data-testid="git-branch-dropdown"
          className="z-[10010] w-[min(300px,calc(100vw-24px))] rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2 shadow-xl"
        >
          <label className="sr-only" htmlFor="git-branch-dropdown-filter">
            {t('idePanels.git.filterBranches')}
          </label>
          <PanelInput
            id="git-branch-dropdown-filter"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('idePanels.git.findBranch')}
            className="w-full"
          />
          <div className="mt-2 max-h-56 overflow-auto" role="listbox" aria-label={t('idePanels.git.branches')}>
            {filtered.length ? (
              filtered.map((item) => {
                const isCurrent = !detached && item === branch;

                return (
                  <button
                    key={item}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    data-testid="git-branch-dropdown-item"
                    disabled={busy}
                    className={classNames(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-bolt-elements-background-depth-3 disabled:opacity-60',
                      isCurrent
                        ? 'font-semibold text-bolt-elements-textPrimary'
                        : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                    )}
                    onClick={() => {
                      setOpen(false);

                      // Re-checking-out the current branch is a no-op; skip the request.
                      if (!isCurrent) {
                        onCheckout(item);
                      }
                    }}
                  >
                    <span
                      className={classNames(
                        'shrink-0 text-sm',
                        isCurrent ? 'i-ph:check text-bolt-elements-item-contentAccent' : 'i-ph:git-branch opacity-60',
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{item}</span>
                  </button>
                );
              })
            ) : (
              <div className="px-2 py-1.5 text-sm text-bolt-elements-textSecondary">
                {t('idePanels.git.noBranchMatch')}
              </div>
            )}
          </div>
          <div className="mt-2 border-t border-bolt-elements-borderColor pt-2">
            <label
              className="mb-1 block text-xs font-medium text-bolt-elements-textSecondary"
              htmlFor="git-branch-dropdown-new"
            >
              {detached ? t('idePanels.git.newBranchFromCommit') : t('idePanels.git.newBranchFromBranch', { branch })}
            </label>
            <div className="flex gap-2">
              <PanelInput
                id="git-branch-dropdown-new"
                value={newBranch}
                onChange={(event) => setNewBranch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    submitCreate();
                  }
                }}
                placeholder={t('idePanels.git.branchExample')}
                className="min-w-0 flex-1"
              />
              <button
                type="button"
                data-testid="git-branch-dropdown-create"
                disabled={busy || !newBranch.trim()}
                onClick={submitCreate}
                className="inline-flex h-[34px] shrink-0 items-center gap-1 rounded-[6px] border border-bolt-elements-item-contentAccent/50 px-2.5 text-[13px] font-medium text-bolt-elements-item-contentAccent hover:bg-bolt-elements-background-depth-3 disabled:opacity-60"
              >
                <span className="i-ph:plus text-sm" aria-hidden />
                {t('idePanels.git.create')}
              </button>
            </div>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/*
 * `↑N ↓M` ahead/behind badge — a clickable control (not just a label) that
 * opens the real Push / Pull actions. Push/pull are disabled with a reason
 * when no remote is configured or when HEAD is detached.
 */
function GitAheadBehindBadge({
  ahead,
  behind,
  busy,
  detached,
  hasRemote,
  onPush,
  onPull,
}: {
  ahead: number;
  behind: number;
  busy: boolean;
  detached: boolean;
  hasRemote: boolean;
  onPush: () => void;
  onPull: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const disabledReason = !hasRemote
    ? t('idePanels.git.noRemoteReason')
    : detached
      ? t('idePanels.git.detachedReason')
      : undefined;

  const actionButton =
    'inline-flex h-[32px] w-full items-center justify-center gap-1.5 rounded-[6px] border border-bolt-elements-borderColor text-[13px] font-medium text-bolt-elements-item-contentAccent hover:bg-bolt-elements-background-depth-3 disabled:opacity-60 disabled:text-bolt-elements-textSecondary';

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          data-testid="git-ahead-behind-badge"
          title={t('idePanels.git.syncSummary', { ahead, behind })}
          aria-label={t('idePanels.git.syncActions', { ahead, behind })}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-xs text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary"
        >
          <span className="i-ph:arrow-up text-[11px]" aria-hidden />
          {ahead}
          <span className="i-ph:arrow-down text-[11px]" aria-hidden />
          {behind}
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="end"
          sideOffset={6}
          data-testid="git-ahead-behind-popover"
          className="z-[10010] w-[min(240px,calc(100vw-24px))] rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2 shadow-xl"
        >
          <div className="grid gap-2">
            <button
              type="button"
              data-testid="git-badge-push"
              disabled={busy || Boolean(disabledReason)}
              className={actionButton}
              onClick={() => {
                setOpen(false);
                onPush();
              }}
            >
              <span className="i-ph:arrow-up text-sm" aria-hidden />
              {ahead > 0 ? t('idePanels.git.pushCount', { count: ahead }) : t('idePanels.git.push')}
            </button>
            <button
              type="button"
              data-testid="git-badge-pull"
              disabled={busy || Boolean(disabledReason)}
              className={actionButton}
              onClick={() => {
                setOpen(false);
                onPull();
              }}
            >
              <span className="i-ph:arrow-down text-sm" aria-hidden />
              {behind > 0 ? t('idePanels.git.pullCount', { count: behind }) : t('idePanels.git.pull')}
            </button>
            {disabledReason ? (
              <p className="px-1 text-xs leading-4 text-bolt-elements-textSecondary">{disabledReason}</p>
            ) : null}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export function GitTab({ projectId }: GitTabProps) {
  const { t, i18n } = useTranslation();
  const astCopy = getClientAstResidualCopy(i18n.resolvedLanguage ?? i18n.language);
  const { currentWorkspaceId } = useCurrentWorkspace();
  const [envelope, setEnvelope] = useState<Envelope | undefined>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  /*
   * Soft, non-destructive notice for a transiently-degraded git status (the loader
   * returned an empty status + gitLoadError marker). Unlike `error` (red banner)
   * this does NOT blank the working-tree list — it tells the user the shown list
   * may be momentarily stale while the git backend recovers.
   */
  const [degradedNotice, setDegradedNotice] = useState<string | undefined>();
  const [staged, setStaged] = useState<Set<string>>(new Set());
  const [inspectFile, setInspectFile] = useState('');

  // When the panel last successfully loaded git state (Replit "last fetched Xago").
  const [lastLoadedAt, setLastLoadedAt] = useState<string | undefined>();

  // Settings sub-pane (⚙): Remote / Connections / Commit author, like Replit.
  const [showSettings, setShowSettings] = useState(false);

  // Discard confirmation target: a single file path, or 'all' for every change.
  const [discardConfirm, setDiscardConfirm] = useState<{ all: boolean; path?: string } | null>(null);

  // G5: disconnect-remote confirmation dialog (token-styled, not window.confirm).
  const [confirmDisconnectRemote, setConfirmDisconnectRemote] = useState(false);

  // Name typed into the detached-HEAD banner's "New branch from here" input.
  const [detachedNewBranch, setDetachedNewBranch] = useState('');

  // Selected commit detail (Replit-style: click a commit → files + diff + Restore).
  const [commitDetail, setCommitDetail] = useState<{
    sha: string;
    files: Array<{ status: string; path: string }>;
    diff: string;
    loading: boolean;
  } | null>(null);

  const [restoreConfirm, setRestoreConfirm] = useState<string | null>(null);

  // Inline merge editor: the conflict file currently open + its marker content.
  const [mergeFile, setMergeFile] = useState<string | null>(null);
  const [mergeContent, setMergeContent] = useState<MergeContentState | null>(null);
  const commitRequestRef = useRef(0);
  const mergeRequestRef = useRef(0);
  const loadRequestRef = useRef(0);
  const inspectionRequestRef = useRef(0);

  // Last working-tree file signature we triggered a silent git reload for.
  const filesSignatureRef = useRef('');

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

  // Detached HEAD: the API reports the short commit SHA as `branch` + detached:true.
  const detached = Boolean(status?.detached);

  const changedFiles: GitFileStatus[] =
    status?.fileStatuses ?? status?.changedFiles?.map((path: string) => ({ path, status: 'M' })) ?? [];

  const conflicts: GitFileStatus[] = status?.conflicts ?? [];
  const branches = data.branches ?? [];
  const commits = data.commits ?? [];
  const stashes = data.stashes ?? [];
  const hasRemote = Boolean(project?.gitRepositoryUrl);
  const activeLanguage = i18n.resolvedLanguage ?? i18n.language;

  /*
   * Default commit author saved in Settings (⚙ → Commit author); prefills the
   * commit form. Re-read when the settings pane toggles so a save is picked up.
   */
  const commitAuthorDefault = useMemo<{ name?: string; email?: string }>(() => {
    if (typeof window === 'undefined' || !projectId) {
      return {};
    }

    try {
      return JSON.parse(localStorage.getItem(`vibecore:git:commit-author:${projectId}`) ?? '{}');
    } catch {
      return {};
    }
  }, [projectId, showSettings]);

  const activeWorkspaceId = data.activeWorkspaceId;
  const resolvedWorkspaceId = currentWorkspaceId ?? activeWorkspaceId;

  const loadPanel = useCallback(
    async (options?: { silent?: boolean; blameFile?: string; diffFile?: string }) => {
      if (!projectId) {
        return;
      }

      const requestId = ++loadRequestRef.current;

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

        if (requestId !== loadRequestRef.current) {
          return;
        }

        if (!response.ok) {
          /*
           * A failed foreground load should surface the error and clear the
           * stale view. A silent background refresh (FilesStore listener,
           * focus/visibility reconcile, post-action reload) must NOT pop a red
           * banner or blank the working-tree list the user is looking at — the
           * workspace git endpoint can transiently 5xx/lock mid-generation.
           * Preserve the previously loaded state and try again on the next tick.
           */
          if (shouldSurfaceLoadError(options?.silent)) {
            throw new Error();
          }

          return;
        }

        const isErrorEnvelope = payload.status === 'error' && Boolean(payload.error);

        /*
         * Soft-degraded marker: the loader swallowed a transient git-status 5xx
         * into an OK envelope with an EMPTY status + a `gitLoadError` note. That
         * envelope has `status:'ok'`, so without the degraded guard a silent
         * refresh would apply it and collapse the live "N changed files" list to
         * zero mid-generation. Retain the last known good list instead.
         */
        const degraded = Boolean(payload.data?.gitLoadError);

        /*
         * Only replace the visible envelope when it carries real data. An error
         * envelope typically has no `data`, and a degraded envelope carries a
         * placeholder empty status, so applying either during a silent refresh
         * would collapse `changedFiles` to [] and re-render "No changed files",
         * wiping the live working-tree list.
         */
        if (shouldApplyEnvelopeForLoad(options?.silent, isErrorEnvelope, degraded)) {
          setEnvelope(payload);
        }

        /*
         * Only advance the "last fetched" timestamp when the response carried
         * real data. An error/degraded envelope keeps (or blanks-to-placeholder)
         * the working tree without a genuine status; bumping the timestamp anyway
         * would tell the user a stale/placeholder list is fresh ("just now").
         */
        if (shouldAdvanceLastFetched(isErrorEnvelope, degraded)) {
          setLastLoadedAt(new Date().toISOString());
        }

        if (isErrorEnvelope) {
          if (shouldSurfaceLoadError(options?.silent)) {
            setError(t('idePanels.git.loadFailed'));
          }
        } else {
          setError(undefined);
        }

        /*
         * Surface a transient degrade non-destructively: keep the working-tree
         * list on screen and show a soft inline notice. Clear it once a healthy
         * (non-degraded) status loads.
         */
        if (degraded) {
          setDegradedNotice(t('idePanels.git.degraded'));
        } else if (!isErrorEnvelope) {
          setDegradedNotice(undefined);
        }
      } catch {
        if (requestId !== loadRequestRef.current) {
          return;
        }

        if (shouldSurfaceLoadError(options?.silent)) {
          setError(t('idePanels.git.loadFailed'));
        }
      } finally {
        if (!options?.silent && requestId === loadRequestRef.current) {
          setLoading(false);
        }
      }
    },
    [projectId, currentWorkspaceId, t],
  );

  useEffect(() => {
    /*
     * Reset per-file inspection state when the IDE-wide workspace changes; the
     * staged paths/blame/diff belong to the previous workspace's working tree.
     */
    inspectionRequestRef.current += 1;
    commitRequestRef.current += 1;
    mergeRequestRef.current += 1;
    setStaged(new Set());
    setInspectFile('');
    setInspection({ loading: false, blame: [], diff: '' });
    setCommitDetail(null);
    setRestoreConfirm(null);
    setMergeFile(null);
    setMergeContent(null);
  }, [currentWorkspaceId]);

  useEffect(() => {
    void loadPanel();
  }, [loadPanel]);

  /*
   * Live working-tree refresh: while the agent (or the user) edits the app the
   * "Working tree" list and the "N changed" count must track real edits instead
   * of freezing at whatever was loaded when the tab opened. We listen to the
   * workbench FilesStore and silently reload git state when the file set
   * actually changes (debounced to coalesce bursts), and reconcile when the tab
   * regains focus/visibility after the user was away.
   */
  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    // Seed the baseline so the first emission after mount does not double-fetch.
    filesSignatureRef.current = computeWorkspaceFilesSignature(workbenchStore.files.get());

    const reloadSilently = debounce(() => {
      void loadPanel({ silent: true });
    }, 800);

    const handleFilesChange = () => {
      const nextSignature = computeWorkspaceFilesSignature(workbenchStore.files.get());

      if (!shouldRefreshOnFilesChange(filesSignatureRef.current, nextSignature)) {
        return;
      }

      filesSignatureRef.current = nextSignature;
      reloadSilently();
    };

    const handleVisibility = () => {
      if (shouldRefreshOnVisibility(document.visibilityState)) {
        void loadPanel({ silent: true });
      }
    };

    const unsubscribeFiles = workbenchStore.files.listen(handleFilesChange);
    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsubscribeFiles();
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadPanel]);

  const stagedFiles = useMemo(() => Array.from(staged), [staged]);
  const unserializableStagedFiles = useMemo(() => findUnserializableStagedFiles(stagedFiles), [stagedFiles]);

  const submitAction = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!projectId) {
        return;
      }

      const form = event.currentTarget;
      const formData = new FormData(form);
      const intent = String(formData.get('intent') ?? 'default');

      /*
       * The action route parses staged paths with `split(',')`, so a path
       * containing a comma would be mis-split and silently dropped from the
       * commit while still reporting success. Refuse rather than lose the
       * change.
       */
      if (intent === 'commit' || intent === 'commit-push') {
        const unserializable = findUnserializableStagedFiles(stagedFiles);

        if (unserializable.length) {
          const message = t('idePanels.git.commaCommitError', { paths: unserializable.join(', ') });
          setError(message);
          toast.error(message);

          return;
        }
      }

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

        if (!response.ok) {
          throw new Error();
        }

        form.reset();
        setStaged(new Set());
        toast.success(t('idePanels.git.actionCompleted'));
        await loadPanel({ silent: true });
      } catch {
        const message = t('idePanels.git.actionFailed');
        setError(message);
        toast.error(message);
      } finally {
        setBusy(false);
      }
    },
    [loadPanel, projectId, resolvedWorkspaceId, stagedFiles, t],
  );

  /*
   * Programmatic equivalent of submitAction for buttons that aren't a <form>
   * submit (e.g. discard). Posts the same intent payload to the git panel action.
   */
  const runIntent = useCallback(
    async (intent: string, fields: Record<string, string> = {}) => {
      if (!projectId) {
        return;
      }

      const formData = new FormData();
      formData.set('intent', intent);

      for (const [key, value] of Object.entries(fields)) {
        formData.set(key, value);
      }

      if (resolvedWorkspaceId) {
        formData.set('workspaceId', resolvedWorkspaceId);
      }

      setBusy(true);
      setError(undefined);

      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ide-panel/git`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error();
        }

        setStaged(new Set());
        toast.success(t('idePanels.git.actionCompleted'));
        await loadPanel({ silent: true });
      } catch {
        const message = t('idePanels.git.actionFailed');
        setError(message);
        toast.error(message);
      } finally {
        setBusy(false);
      }
    },
    [loadPanel, projectId, resolvedWorkspaceId, t],
  );

  const loadInspection = useCallback(
    async (filePath = inspectFile) => {
      if (!filePath || !projectId) {
        return;
      }

      const requestId = ++inspectionRequestRef.current;

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
          throw new Error();
        }

        const payload = (await response.json()) as Envelope;
        const fileData = payload.data ?? {};

        if (requestId !== inspectionRequestRef.current) {
          return;
        }

        setInspection({
          loading: false,
          blame: (fileData as any).blame ?? [],
          diff: (fileData as any).diff ?? '',
        });
      } catch {
        if (requestId !== inspectionRequestRef.current) {
          return;
        }

        setInspection({
          loading: false,
          blame: [],
          diff: '',
          error: t('idePanels.git.inspectionFailed'),
        });
      }
    },
    [inspectFile, projectId, resolvedWorkspaceId, t],
  );

  const loadCommit = useCallback(
    async (sha: string) => {
      if (!sha || !projectId) {
        return;
      }

      const requestId = ++commitRequestRef.current;
      setCommitDetail({ sha, files: [], diff: '', loading: true });

      try {
        const params = new URLSearchParams({ commitSha: sha });

        if (resolvedWorkspaceId) {
          params.set('workspaceId', resolvedWorkspaceId);
        }

        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/ide-panel/git?${params.toString()}`,
          { headers: { accept: 'application/json' } },
        );

        if (!response.ok) {
          throw new Error(
            formatClientAstResidualCopy(astCopy['clientAst.git.commitLoadFailed'], {
              status: response.status,
            }),
          );
        }

        const payload = (await response.json()) as Envelope;
        const detail = ((payload.data ?? {}) as any).commitDetail;

        if (requestId !== commitRequestRef.current) {
          return;
        }

        setCommitDetail({
          sha: detail?.sha ?? sha,
          files: Array.isArray(detail?.files) ? detail.files : [],
          diff: detail?.diff ?? '',
          loading: false,
        });
      } catch {
        if (requestId !== commitRequestRef.current) {
          return;
        }

        setCommitDetail({ sha, files: [], diff: '', loading: false });
      }
    },
    [astCopy, projectId, resolvedWorkspaceId],
  );

  const loadConflictFile = useCallback(
    async (path: string) => {
      if (!path || !projectId) {
        return;
      }

      const requestId = ++mergeRequestRef.current;
      setMergeFile(path);
      setMergeContent({ content: '', loading: true });

      try {
        const params = new URLSearchParams({ conflictFile: path });

        if (resolvedWorkspaceId) {
          params.set('workspaceId', resolvedWorkspaceId);
        }

        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/ide-panel/git?${params.toString()}`,
          { headers: { accept: 'application/json' } },
        );

        if (!response.ok) {
          throw new Error(
            formatClientAstResidualCopy(astCopy['clientAst.git.conflictLoadFailed'], {
              status: response.status,
            }),
          );
        }

        const payload = (await response.json()) as Envelope;
        const detail = ((payload.data ?? {}) as any).conflictContent;

        if (requestId !== mergeRequestRef.current) {
          return;
        }

        setMergeContent(resolveConflictContentState(detail?.content));
      } catch {
        if (requestId !== mergeRequestRef.current) {
          return;
        }

        setMergeContent(failedConflictContentState());
      }
    },
    [astCopy, projectId, resolvedWorkspaceId],
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
        {t('idePanels.git.loadingStatus')}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="grid gap-4 p-4">
        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {error}
          </div>
        )}

        {detached ? (
          <div
            className="rounded-lg border p-3 text-sm"
            role="status"
            data-testid="git-detached-warning"
            style={{
              borderColor: 'color-mix(in srgb, var(--status-warning-text) 45%, transparent)',
              background: 'color-mix(in srgb, var(--status-warning-text) 8%, transparent)',
            }}
          >
            <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--status-warning-text)' }}>
              <span className="i-ph:warning-circle text-base" aria-hidden />
              {t('idePanels.git.detachedTitle', { branch })}
            </div>
            <p className="mt-1 text-bolt-elements-textSecondary">{t('idePanels.git.detachedBody')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="sr-only" htmlFor="git-detached-new-branch">
                {t('idePanels.git.newBranchName')}
              </label>
              <PanelInput
                id="git-detached-new-branch"
                value={detachedNewBranch}
                onChange={(event) => setDetachedNewBranch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && detachedNewBranch.trim()) {
                    event.preventDefault();
                    setDetachedNewBranch('');
                    void runIntent('create-branch', { branch: detachedNewBranch.trim() });
                  }
                }}
                placeholder={t('idePanels.git.rescueBranchExample')}
                className="min-w-0 flex-1 sm:max-w-[260px]"
              />
              <button
                type="button"
                data-testid="git-detached-new-branch-button"
                disabled={busy || !detachedNewBranch.trim()}
                className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-[6px] border border-bolt-elements-item-contentAccent/50 px-3 text-[13px] font-medium text-bolt-elements-item-contentAccent hover:bg-bolt-elements-background-depth-3 disabled:opacity-60"
                onClick={() => {
                  const name = detachedNewBranch.trim();
                  setDetachedNewBranch('');
                  void runIntent('create-branch', { branch: name });
                }}
              >
                <span className="i-ph:git-branch text-sm" aria-hidden />
                {t('idePanels.git.newBranchHere')}
              </button>
            </div>
          </div>
        ) : null}

        {conflicts.length > 0 ? (
          <div
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
            role="alert"
            data-testid="git-merge-conflict-banner"
          >
            <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-400">
              <span className="i-ph:warning-circle text-base" aria-hidden />
              {t('idePanels.git.conflictBannerTitle')}
            </div>
            <p className="mt-1 text-bolt-elements-textSecondary">
              {t('idePanels.git.conflictBannerBody', { count: conflicts.length })}
            </p>
          </div>
        ) : null}

        {showSettings && project?.id ? (
          <GitSettingsPanel
            projectId={project.id}
            gitRepositoryUrl={project.gitRepositoryUrl}
            defaultBranch={project.gitDefaultBranch}
            workspaceId={resolvedWorkspaceId}
            busy={busy}
            onClose={() => setShowSettings(false)}
            onRemoteConfigured={() => loadPanel({ silent: true })}
          />
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
          {/*
           * Branch bar. In the IDE you are already inside the active workspace, so
           * the workspace identity (name/status/primary) and the duplicate
           * ahead/behind (shown in the sync row above) and remote URL (in Remote
           * settings) were redundant clutter — dropped. Keep only what's specific
           * to git here: current branch + working-tree change count.
           */}
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
              {t('idePanels.git.branch')}
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-sm text-bolt-elements-textSecondary">
              <span
                className={classNames(
                  'text-base',
                  detached ? 'i-ph:warning' : 'i-ph:git-branch text-bolt-elements-item-contentAccent',
                )}
                style={detached ? { color: 'var(--status-warning-text)' } : undefined}
                aria-hidden
              />
              <strong
                className={classNames('truncate', detached ? undefined : 'text-bolt-elements-textPrimary')}
                style={detached ? { color: 'var(--status-warning-text)' } : undefined}
              >
                {detached ? t('idePanels.git.detachedBranch', { branch }) : branch}
              </strong>
              <span>{t('idePanels.git.changed', { count: changedFiles.length })}</span>
              {conflicts.length ? (
                <span className="text-red-500">{t('idePanels.git.conflicts', { count: conflicts.length })}</span>
              ) : null}
              <GitAheadBehindBadge
                ahead={status?.ahead ?? 0}
                behind={status?.behind ?? 0}
                busy={busy}
                detached={detached}
                hasRemote={hasRemote}
                onPush={() => void runIntent('push', { branch })}
                onPull={() => void runIntent('pull', { branch })}
              />
            </div>
          </div>
          <div className="flex min-w-[min(240px,100%)] items-center gap-2">
            <GitBranchDropdown
              branch={branch}
              branches={branches}
              detached={detached}
              busy={busy}
              onCheckout={(nextBranch) => void runIntent('checkout-branch', { branch: nextBranch })}
              onCreate={(newBranch) => void runIntent('create-branch', { branch: newBranch })}
            />
            {/*
              44×44 minimum, comme le bouton de rafraîchissement jumeau de
              GitBranchSyncControls : à `h-8 w-8` la cible tombait à 28×42 sur
              iPhone, sous le seuil WCAG 2.5.5, alors que son frère le respectait
              déjà. Deux boutons de la même fonctionnalité ne peuvent pas avoir
              deux tailles de cible.
            */}
            <button
              type="button"
              data-testid="git-branch-refresh"
              disabled={loading}
              onClick={() => void loadPanel()}
              title={t('idePanels.git.refreshStatus')}
              aria-label={t('idePanels.git.refreshStatus')}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-[6px] text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary disabled:opacity-50"
            >
              <span className="i-ph:arrows-clockwise text-base" aria-hidden />
            </button>
            <button
              type="button"
              data-testid="git-settings-toggle"
              aria-pressed={showSettings}
              onClick={() => setShowSettings((value) => !value)}
              title={t('idePanels.git.settings')}
              aria-label={t('idePanels.git.settings')}
              className={classNames(
                'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-[6px] hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary',
                showSettings ? 'text-bolt-elements-item-contentAccent' : 'text-bolt-elements-textSecondary',
              )}
            >
              <span className="i-ph:gear text-base" aria-hidden />
            </button>
          </div>
        </div>

        {/*
         * No bulky inline connect panel in the main pane (kept it Replit-clean):
         * all provider connection + remote-URL management lives in the ⚙ Settings
         * sub-pane (Connections + Remote sections). When there's no remote, show a
         * single discreet line that opens Settings.
         */}
        {!hasRemote && project?.id ? (
          <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3">
            {/*
             * BUG-I18N-008 — la même phrase s'affichait DEUX FOIS d'affilée.
             *
             * Cette ligne rendait `idePanels.git.noRemote` (« Aucun dépôt distant
             * connecté ») juste au-dessus de `GitProviderConnectPanel`, dont le
             * titre `gitProvider.title` porte EXACTEMENT le même texte. Deux
             * chaînes de catalogues différents, même phrase, l'une sous l'autre.
             *
             * C'est le titre du panneau qui reste : il vit dans l'encadré ambre,
             * porte sa description et précède directement les actions. La ligne
             * extérieure n'apportait qu'une répétition.
             */}
            {/*
             * Connect a Git provider (GitHub/GitLab/Bitbucket OAuth or a custom
             * remote) directly in the pane — Replit-style — instead of bouncing to
             * Settings. Reuses the themed, responsive GitProviderConnectPanel.
             */}
            <GitProviderConnectPanel
              projectId={project.id}
              gitRepositoryUrl={project?.gitRepositoryUrl}
              defaultBranch={project?.gitDefaultBranch}
              workspaceId={resolvedWorkspaceId}
              busy={busy}
              onRemoteConfigured={() => loadPanel({ silent: true })}
            />
            <button
              type="button"
              data-testid="git-connect-cta"
              onClick={() => setShowSettings(true)}
              className="mt-2 inline-flex h-7 items-center gap-1 rounded-md px-1 text-xs font-medium text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
            >
              <span className="i-ph:gear text-sm" aria-hidden />
              {t('idePanels.git.advancedSettings')}
            </button>
          </div>
        ) : null}

        {/*
         * Remote Updates — Replit Git "Remote Updates" section: the linked repo
         * (click → forge), the tracked ref (origin/<branch> • upstream), and the
         * Settings + Fetch controls. Shown only when a remote is connected.
         */}
        {hasRemote && project?.gitRepositoryUrl ? (
          <div
            data-testid="git-remote-updates"
            className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-bolt-elements-textTertiary">
                {t('idePanels.git.remoteUpdates')}
              </span>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  title={t('idePanels.git.settings')}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-bolt-elements-borderColor px-2 text-xs font-medium text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary"
                >
                  <span className="i-ph:gear text-sm" aria-hidden />
                  {t('idePanels.git.settingsShort')}
                </button>
                <button
                  type="button"
                  data-testid="git-fetch"
                  disabled={loading}
                  onClick={() => void loadPanel()}
                  title={t('idePanels.git.refreshFetch')}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-bolt-elements-borderColor px-2 text-xs font-medium text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary disabled:opacity-50"
                >
                  <span
                    className={classNames('i-ph:arrows-clockwise text-sm', loading && 'animate-spin')}
                    aria-hidden
                  />
                  {t('idePanels.git.fetch')}
                </button>
                <button
                  type="button"
                  data-testid="git-disconnect-remote"
                  disabled={busy}
                  onClick={() => setConfirmDisconnectRemote(true)}
                  title={t('idePanels.git.disconnectRemote')}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-bolt-elements-borderColor px-2 text-xs font-medium text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-red-500 disabled:opacity-50"
                >
                  <span className="i-ph:plugs text-sm" aria-hidden />
                  {t('idePanels.git.disconnect')}
                </button>
              </div>
            </div>
            <a
              href={project.gitRepositoryUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 block truncate text-sm font-medium text-[var(--ecode-accent,#F26207)] hover:underline"
            >
              {project.gitRepositoryUrl.replace(/^https?:\/\/[^/]+\//, '').replace(/\.git$/, '')}
            </a>
            <span className="text-xs text-bolt-elements-textTertiary">
              {t('idePanels.git.remoteTracking', { branch })}
              {project.gitDefaultBranch
                ? ` · ${t('idePanels.git.defaultBranch', { branch: project.gitDefaultBranch })}`
                : ''}{' '}
              · {t('idePanels.git.lastFetched', { time: timeAgo(lastLoadedAt, activeLanguage, t) })}
            </span>
          </div>
        ) : null}

        <ConfirmationDialog
          isOpen={confirmDisconnectRemote}
          onClose={() => setConfirmDisconnectRemote(false)}
          onConfirm={() => {
            setConfirmDisconnectRemote(false);
            void runIntent('remove-remote');
          }}
          title={t('idePanels.git.disconnectTitle')}
          description={t('idePanels.git.disconnectBody')}
          confirmLabel={t('idePanels.git.disconnect')}
          variant="destructive"
        />

        {discardConfirm ? (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            data-testid="git-discard-confirm"
            onClick={() => setDiscardConfirm(null)}
          >
            <div
              className="w-[min(420px,100%)] rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="flex items-center gap-2 text-[13px] font-semibold text-bolt-elements-textPrimary">
                <span className="i-ph:warning-circle text-base text-red-500" aria-hidden />
                {t('idePanels.git.discardTitle')}
              </h3>
              <p className="mt-2 text-sm text-bolt-elements-textSecondary">
                {discardConfirm.all
                  ? t('idePanels.git.discardAllBody', { count: changedFiles.length })
                  : t('idePanels.git.discardFileBody', { path: discardConfirm.path })}
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
                  onClick={() => setDiscardConfirm(null)}
                >
                  {t('idePanels.common.cancel')}
                </button>
                <button
                  type="button"
                  data-testid="git-discard-confirm-button"
                  disabled={busy}
                  className="rounded-md bg-red-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-60"
                  onClick={() => {
                    const target = discardConfirm;

                    /*
                     * The action route parses `filePaths` with `split(',')`, so a single
                     * path containing a comma would be mis-split into bogus paths: the
                     * real changed file is never discarded yet the user still sees a
                     * success toast. Refuse rather than revert the wrong files. (The
                     * commit path has the same guard via findUnserializableStagedFiles.)
                     */
                    if (!target.all && target.path && pathBreaksCommaSerialization(target.path)) {
                      const message = t('idePanels.git.commaDiscardError', { path: target.path });
                      setDiscardConfirm(null);
                      setError(message);
                      toast.error(message);

                      return;
                    }

                    setDiscardConfirm(null);
                    void runIntent('discard', target.all || !target.path ? {} : { filePaths: target.path });
                  }}
                >
                  {discardConfirm.all ? t('idePanels.git.discardAll') : t('idePanels.git.discardFile')}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {restoreConfirm ? (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            data-testid="git-restore-confirm"
            onClick={() => setRestoreConfirm(null)}
          >
            <div
              className="w-[min(440px,100%)] rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="flex items-center gap-2 text-[13px] font-semibold text-bolt-elements-textPrimary">
                <span
                  className="i-ph:clock-counter-clockwise text-base text-bolt-elements-item-contentAccent"
                  aria-hidden
                />
                {t('idePanels.git.restoreTitle')}
              </h3>
              <p className="mt-2 text-sm text-bolt-elements-textSecondary">
                {t('idePanels.git.restoreBody', { sha: restoreConfirm.slice(0, 8) })}
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
                  onClick={() => setRestoreConfirm(null)}
                >
                  {t('idePanels.common.cancel')}
                </button>
                <button
                  type="button"
                  data-testid="git-restore-confirm-button"
                  disabled={busy}
                  className="rounded-md bg-bolt-elements-item-contentAccent px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                  onClick={() => {
                    const sha = restoreConfirm;
                    setRestoreConfirm(null);
                    setCommitDetail(null);
                    void runIntent('restore', { sha });
                  }}
                >
                  {t('idePanels.git.restoreAll')}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mx-auto grid w-full max-w-3xl gap-4">
          {hasRemote ? (
            <GitBranchSyncControls
              branch={branch}
              busy={busy}
              idPrefix="git-tab"
              onSubmit={submitAction}
              repoUrl={project?.gitRepositoryUrl}
              lastFetched={lastLoadedAt ? timeAgo(lastLoadedAt, activeLanguage, t) : undefined}
              onRefresh={() => void loadPanel()}
              loading={loading}
            />
          ) : null}

          <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3 sm:items-center">
              <div>
                <h3 className="text-[13px] font-semibold text-bolt-elements-textPrimary">
                  {t('idePanels.git.workingTree')}
                </h3>
                <p className="mt-1 text-xs text-bolt-elements-textSecondary">{t('idePanels.git.workingTreeBody')}</p>
              </div>
              {changedFiles.length ? (
                <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    data-testid="git-stage-all"
                    className="rounded-md border border-bolt-elements-borderColor px-2.5 py-1 text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
                    onClick={() => setStaged(new Set(changedFiles.map((file) => String(file.path ?? file))))}
                  >
                    {t('idePanels.git.stageAll')}
                  </button>
                  {staged.size ? (
                    <button
                      type="button"
                      data-testid="git-unstage-all"
                      className="rounded-md border border-bolt-elements-borderColor px-2.5 py-1 text-xs font-medium text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3"
                      onClick={() => setStaged(new Set())}
                    >
                      {t('idePanels.git.unstageAll')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    data-testid="git-discard-all"
                    disabled={busy}
                    className="rounded-md border border-red-500/40 px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10 disabled:opacity-60"
                    onClick={() => setDiscardConfirm({ all: true })}
                  >
                    {t('idePanels.git.discardAll')}
                  </button>
                </div>
              ) : null}
            </div>
            {degradedNotice ? (
              <div
                role="status"
                data-testid="git-degraded-notice"
                className="mb-3 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-xs text-bolt-elements-textSecondary"
              >
                {degradedNotice}
              </div>
            ) : null}
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
                      aria-label={t('idePanels.git.stageFile', { path })}
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
                      {staged.has(path) ? t('idePanels.git.staged') : t('idePanels.git.stage')}
                    </span>
                    <button
                      type="button"
                      aria-label={t('idePanels.git.discardPath', { path })}
                      title={t('idePanels.git.discardChanges')}
                      data-testid="git-discard-file"
                      disabled={busy}
                      className="i-ph:arrow-counter-clockwise flex-shrink-0 text-base text-bolt-elements-textSecondary hover:text-red-500 disabled:opacity-60"
                      onClick={(event) => {
                        event.preventDefault();
                        setDiscardConfirm({ all: false, path });
                      }}
                    />
                  </label>
                );
              })
            ) : (
              <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4 text-sm text-bolt-elements-textSecondary">
                {t('idePanels.git.noChanges')}
              </div>
            )}
            {changedFiles.length ? <GitStatusLegend className="mt-3 bg-bolt-elements-background-depth-1" /> : null}
          </div>

          {conflicts.length > 0 && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4">
              <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-red-500">
                <span className="i-ph:warning text-base" aria-hidden />
                {t('idePanels.git.conflictingFiles', { count: conflicts.length })}
              </h3>
              <p className="mb-3 text-xs text-bolt-elements-textSecondary">{t('idePanels.git.conflictingFilesBody')}</p>
              <button
                type="button"
                className="mb-3 inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-white"
                style={{ background: 'var(--ecode-accent, #F26207)' }}
                data-testid="git-resolve-with-agent"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('vibecore:agent-task', {
                      detail: {
                        kind: 'resolve-git-conflicts',
                        files: conflicts.map((conflict) => String(conflict.path ?? conflict)),
                        branch,
                      },
                    }),
                  )
                }
              >
                <span className="i-ph:sparkle" aria-hidden />
                {t('idePanels.git.resolveWithAgent')}
              </button>
              <div className="grid gap-2">
                {conflicts.map((conflict) => {
                  const path = String(conflict.path ?? conflict);

                  return (
                    <div
                      key={path}
                      className="grid gap-2 rounded-md border border-red-500/30 bg-bolt-elements-background-depth-1 p-3"
                    >
                      <div className="flex items-center gap-2 text-sm font-medium text-bolt-elements-textPrimary">
                        <span className="i-ph:warning text-red-500" aria-hidden />
                        {path}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <form onSubmit={submitAction}>
                          <input name="intent" value="resolve-conflict" type="hidden" />
                          <input name="filePath" value={path} type="hidden" />
                          <input name="strategy" value="ours" type="hidden" />
                          <PanelButton disabled={busy} variant="outline">
                            {t('idePanels.git.keepCurrent')}
                          </PanelButton>
                        </form>
                        <form onSubmit={submitAction}>
                          <input name="intent" value="resolve-conflict" type="hidden" />
                          <input name="filePath" value={path} type="hidden" />
                          <input name="strategy" value="theirs" type="hidden" />
                          <PanelButton disabled={busy} variant="outline">
                            {t('idePanels.git.keepIncoming')}
                          </PanelButton>
                        </form>
                        <button
                          type="button"
                          data-testid="git-resolve-inline"
                          disabled={busy}
                          className="inline-flex h-9 items-center justify-center rounded-md border border-bolt-elements-item-contentAccent/50 px-3 text-sm font-medium text-bolt-elements-item-contentAccent hover:bg-bolt-elements-background-depth-3 disabled:opacity-60"
                          onClick={() => (mergeFile === path ? setMergeFile(null) : void loadConflictFile(path))}
                        >
                          {mergeFile === path ? t('idePanels.git.hideEditor') : t('idePanels.git.resolveInline')}
                        </button>
                      </div>
                      {mergeFile === path ? (
                        mergeContent?.loading ? (
                          <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 text-xs text-bolt-elements-textSecondary">
                            {t('idePanels.git.loadingConflict')}
                          </div>
                        ) : mergeContent?.error ? (
                          <div
                            data-testid="git-merge-load-error"
                            role="alert"
                            className="flex flex-wrap items-center gap-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-500"
                          >
                            <span className="flex-1">{t('idePanels.git.conflictLoadFailed')}</span>
                            <button
                              type="button"
                              data-testid="git-merge-load-retry"
                              disabled={busy}
                              className="inline-flex h-8 items-center justify-center rounded-md border border-red-500/40 px-3 font-medium hover:bg-red-500/10 disabled:opacity-60"
                              onClick={() => void loadConflictFile(path)}
                            >
                              {t('idePanels.common.retry')}
                            </button>
                          </div>
                        ) : (
                          <GitMergeEditor
                            filePath={path}
                            content={mergeContent?.content ?? ''}
                            busy={busy}
                            onCancel={() => setMergeFile(null)}
                            onResolve={(resolved) => {
                              setMergeFile(null);
                              void runIntent('mark-resolved', { filePath: path, content: resolved });
                            }}
                          />
                        )
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
            <h3 className="mb-3 text-[13px] font-semibold text-bolt-elements-textPrimary">
              {t('idePanels.git.stagedTitle')}
            </h3>
            {stagedFiles.length ? (
              <div className="overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
                {stagedFiles.map((file) => (
                  <div
                    key={file}
                    className="border-b border-bolt-elements-borderColor px-3 py-2 text-xs text-bolt-elements-textPrimary last:border-b-0"
                  >
                    <div className="truncate font-medium">{file}</div>
                    <div className="text-bolt-elements-textSecondary">{t('idePanels.git.readyForCommit')}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3 text-sm text-bolt-elements-textSecondary">
                {t('idePanels.git.selectToStage')}
              </div>
            )}
          </div>

          <form
            onSubmit={submitAction}
            className="grid gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
          >
            <input name="stagedFiles" value={stagedFiles.join(',')} type="hidden" />
            <label className="grid gap-1 text-xs font-medium text-bolt-elements-textSecondary">
              {t('idePanels.git.commitMessage')}
              <textarea
                name="message"
                rows={1}
                className="min-h-[32px] rounded-[6px] border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2.5 py-1.5 text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
                placeholder={
                  stagedFiles.length
                    ? t('idePanels.git.commitStaged', { count: stagedFiles.length })
                    : t('idePanels.git.commitSummary')
                }
              />
            </label>
            <details className="text-xs text-bolt-elements-textSecondary">
              <summary className="cursor-pointer">{t('idePanels.git.commitAs')}</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <PanelInput
                  name="authorName"
                  key={`name-${commitAuthorDefault.name ?? ''}`}
                  defaultValue={commitAuthorDefault.name ?? ''}
                  placeholder={t('idePanels.git.authorName')}
                  aria-label={t('idePanels.git.commitAuthorName')}
                />
                <PanelInput
                  name="authorEmail"
                  type="email"
                  key={`email-${commitAuthorDefault.email ?? ''}`}
                  defaultValue={commitAuthorDefault.email ?? ''}
                  placeholder={t('idePanels.git.authorEmailExample')}
                  aria-label={t('idePanels.git.commitAuthorEmail')}
                />
              </div>
              <p className="mt-1 leading-4">{t('idePanels.git.authorOverrideHelp')}</p>
            </details>
            {unserializableStagedFiles.length ? (
              <p className="text-xs text-bolt-elements-icon-error" role="alert">
                {t('idePanels.git.commaPathsHelp', { paths: unserializableStagedFiles.join(', ') })}
              </p>
            ) : null}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <PanelButton
                type="submit"
                name="intent"
                value="commit"
                variant="accent"
                disabled={busy || stagedFiles.length === 0 || unserializableStagedFiles.length > 0}
              >
                {t('idePanels.git.commitChanges')}
              </PanelButton>
              <PanelButton
                type="submit"
                name="intent"
                value="commit-push"
                variant="outline"
                disabled={busy || stagedFiles.length === 0 || unserializableStagedFiles.length > 0}
                title={t('idePanels.git.commitPushHelp')}
              >
                {t('idePanels.git.commitPush')}
              </PanelButton>
            </div>
          </form>

          <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
            <h3 className="mb-3 text-[13px] font-semibold text-bolt-elements-textPrimary">
              {t('idePanels.git.commitGraph')}
            </h3>
            {commits.length ? (
              <div className="grid gap-2">
                {commits.map((commit, index) => {
                  /*
                   * Split the graph by remote state using the ahead count: the first
                   * `ahead` commits are local-only ("Not pushed to remote"), the rest are
                   * "Up to date with remote" — matching Replit's source-control separators.
                   */
                  const aheadCount = status?.ahead ?? 0;

                  return (
                    <Fragment key={commit.sha}>
                      {aheadCount > 0 && index === 0 ? (
                        <div className="flex items-center gap-1.5 px-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-bolt-elements-textTertiary">
                          <span className="i-ph:arrow-down" aria-hidden /> {t('idePanels.git.notPushed')}
                        </div>
                      ) : null}
                      {index === aheadCount ? (
                        <div className="flex items-center gap-1.5 px-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-bolt-elements-textTertiary">
                          <span className="i-ph:arrow-down" aria-hidden /> {t('idePanels.git.upToDate')}
                        </div>
                      ) : null}
                      <button
                        type="button"
                        data-testid="git-commit-row"
                        onClick={() => void loadCommit(commit.sha)}
                        className={classNames(
                          'grid w-full grid-cols-[20px_76px_minmax(0,1fr)] gap-3 rounded-md border bg-bolt-elements-background-depth-1 px-3 py-2 text-left text-sm hover:border-bolt-elements-item-contentAccent',
                          commitDetail?.sha && commit.sha.startsWith(commitDetail.sha)
                            ? 'border-bolt-elements-item-contentAccent'
                            : 'border-bolt-elements-borderColor',
                        )}
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
                            {timeAgo(commit.date, activeLanguage, t)} {commit.refs ? `- ${commit.refs}` : ''}
                            {commit.author ? ` - ${commit.author}` : ''}
                          </div>
                        </div>
                      </button>
                    </Fragment>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4 text-sm text-bolt-elements-textSecondary">
                {t('idePanels.git.noCommits')}
              </div>
            )}

            {commitDetail ? (
              <div
                className="mt-3 rounded-md border border-bolt-elements-item-contentAccent/40 bg-bolt-elements-background-depth-1 p-3"
                data-testid="git-commit-detail"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-bolt-elements-textPrimary">
                    <code className="text-xs text-bolt-elements-item-contentAccent">
                      {commitDetail.sha.slice(0, 8)}
                    </code>
                    <span>
                      {commitDetail.loading
                        ? t('idePanels.git.loading')
                        : t('idePanels.git.changedFiles', { count: commitDetail.files.length })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-testid="git-restore-commit"
                      disabled={busy || commitDetail.loading}
                      className="rounded-md border border-bolt-elements-borderColor px-2.5 py-1 text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 disabled:opacity-60"
                      onClick={() => setRestoreConfirm(commitDetail.sha)}
                    >
                      {t('idePanels.git.restoreAll')}
                    </button>
                    <button
                      type="button"
                      aria-label={t('idePanels.git.closeCommitDetail')}
                      className="i-ph:x text-base text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
                      onClick={() => setCommitDetail(null)}
                    />
                  </div>
                </div>
                {commitDetail.files.length ? (
                  <div className="mb-2 grid gap-1">
                    {commitDetail.files.map((file) => (
                      <div key={file.path} className="flex items-center gap-2 text-xs">
                        <GitStatusBadge status={file.status || 'M'} />
                        <code className="truncate text-bolt-elements-textSecondary">{file.path}</code>
                      </div>
                    ))}
                  </div>
                ) : null}
                {commitDetail.diff ? <GitDiffView diff={commitDetail.diff} /> : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
            <div className="mb-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
              <label className="grid gap-1 text-xs font-medium text-bolt-elements-textSecondary">
                {t('idePanels.git.inspectFile')}
                <PanelInput
                  value={inspectFile}
                  onChange={(event) => setInspectFile(event.target.value)}
                  placeholder={t('idePanels.git.fileExample')}
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 disabled:opacity-60"
                  onClick={() => void loadInspection()}
                  disabled={!inspectFile || inspection.loading}
                >
                  {inspection.loading ? t('idePanels.git.inspecting') : t('idePanels.git.inspect')}
                </button>
              </div>
            </div>
            {inspection.error && (
              <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
                {inspection.error}
              </div>
            )}
            {inspection.diff || inspection.blame.length ? (
              <GitDiffView diff={inspection.diff} blame={inspection.blame} />
            ) : (
              <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4 text-sm text-bolt-elements-textSecondary">
                {t('idePanels.git.inspectionEmpty')}
              </div>
            )}
          </div>
          <details className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
            <summary className="cursor-pointer text-[13px] font-semibold text-bolt-elements-textPrimary">
              {t('idePanels.git.branchActions')}
            </summary>
            <div className="mt-3 grid gap-3">
              <form onSubmit={submitAction} className="grid gap-2">
                <input name="intent" value="create-branch" type="hidden" />
                <label className="text-xs font-medium text-bolt-elements-textSecondary" htmlFor="git-tab-new-branch">
                  {t('idePanels.git.createBranch')}
                </label>
                <PanelInput
                  id="git-tab-new-branch"
                  name="branch"
                  placeholder={t('idePanels.git.createBranchExample')}
                  required
                />
                <PanelInput name="startPoint" defaultValue={branch} aria-label={t('idePanels.git.startPoint')} />
                <PanelButton disabled={busy} variant="outline">
                  {t('idePanels.git.createSwitch')}
                </PanelButton>
              </form>

              <form onSubmit={submitAction} className="grid gap-2">
                <input name="intent" value="stash" type="hidden" />
                <label className="text-xs font-medium text-bolt-elements-textSecondary" htmlFor="git-tab-stash-message">
                  {t('idePanels.git.stashMessage')}
                </label>
                <PanelInput id="git-tab-stash-message" name="message" placeholder={t('idePanels.git.stashExample')} />
                <PanelButton disabled={busy || changedFiles.length === 0} variant="outline">
                  {t('idePanels.git.stashChanges')}
                </PanelButton>
              </form>
            </div>
          </details>

          {stashes.length ? (
            <div className="grid gap-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
              <h3 className="text-[13px] font-semibold text-bolt-elements-textPrimary">{t('idePanels.git.stashes')}</h3>
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
                        {t('idePanels.git.apply')}
                      </PanelButton>
                    </form>
                    <form onSubmit={submitAction}>
                      <input name="intent" value="pop-stash" type="hidden" />
                      <input name="stashRef" value={stash.id} type="hidden" />
                      <PanelButton disabled={busy} variant="outline">
                        {t('idePanels.git.pop')}
                      </PanelButton>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {/*
           * Cherry-pick removed from the pane (keep/cut audit): Replit omits it, and
           * for a vibe-coding/IDE audience it's a niche power-user op that added
           * clutter without real value. The server-side /git/cherry-pick route stays
           * (callable, tested) so nothing is lost for advanced/automation use.
           */}
          <form
            onSubmit={submitAction}
            className="grid gap-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
          >
            <input name="intent" value="pr" type="hidden" />
            <label className="text-xs font-medium text-bolt-elements-textSecondary" htmlFor="git-tab-pr-title">
              {t('idePanels.git.prTitle')}
            </label>
            <PanelInput id="git-tab-pr-title" name="title" placeholder={t('idePanels.git.prTitleExample')} />
            {/*
             * Capture iPhone d'Avi, 06/09 13:08 : deux champs « main » / « main »
             * sans un mot au-dessus — l'`aria-label` parle au lecteur d'écran,
             * pas à l'œil. Le libellé devient visible, comme celui du titre.
             */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-medium text-bolt-elements-textSecondary">
                {t('idePanels.git.sourceBranch')}
                <PanelInput name="sourceBranch" defaultValue={branch} data-testid="git-tab-pr-source" />
              </label>
              <label className="grid gap-1 text-xs font-medium text-bolt-elements-textSecondary">
                {t('idePanels.git.targetBranch')}
                <PanelInput
                  name="targetBranch"
                  defaultValue={project?.gitDefaultBranch ?? 'main'}
                  data-testid="git-tab-pr-target"
                />
              </label>
            </div>
            <textarea
              name="body"
              className="min-h-20 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-2 text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
              placeholder={t('idePanels.git.prBodyExample')}
              aria-label={t('idePanels.git.prDescription')}
            />
            <PanelButton disabled={busy || !hasRemote} variant="outline">
              {t('idePanels.git.createPr')}
            </PanelButton>
            {!hasRemote && (
              <p className="text-xs text-bolt-elements-textSecondary">{t('idePanels.git.configureRemote')}</p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

export default GitTab;
